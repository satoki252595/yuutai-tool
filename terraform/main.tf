# Terraform設定ファイル for GCE

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0"
}

# 変数定義
variable "project_id" {
  description = "GCPプロジェクトID"
  type        = string
}

variable "region" {
  description = "GCPリージョン"
  type        = string
  default     = "asia-northeast1"
}

variable "zone" {
  description = "GCPゾーン"
  type        = string
  default     = "asia-northeast1-a"
}

variable "machine_type" {
  description = "インスタンスタイプ"
  type        = string
  default     = "e2-medium"
}

# プロバイダー設定
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# VPCネットワーク
resource "google_compute_network" "yuutai_network" {
  name                    = "yuutai-network"
  auto_create_subnetworks = false
}

# サブネット
resource "google_compute_subnetwork" "yuutai_subnet" {
  name          = "yuutai-subnet"
  network       = google_compute_network.yuutai_network.id
  ip_cidr_range = "10.0.1.0/24"
  region        = var.region
}

# ファイアウォールルール - HTTP
resource "google_compute_firewall" "allow_http" {
  name    = "yuutai-allow-http"
  network = google_compute_network.yuutai_network.name

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["http-server"]
}

# ファイアウォールルール - HTTPS
resource "google_compute_firewall" "allow_https" {
  name    = "yuutai-allow-https"
  network = google_compute_network.yuutai_network.name

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["https-server"]
}

# ファイアウォールルール - SSH
resource "google_compute_firewall" "allow_ssh" {
  name    = "yuutai-allow-ssh"
  network = google_compute_network.yuutai_network.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ssh-server"]
}

# 永続ディスク
resource "google_compute_disk" "yuutai_data" {
  name = "yuutai-data"
  type = "pd-standard"
  zone = var.zone
  size = 20

  labels = {
    environment = "production"
    app         = "yuutai"
  }
}

# 静的IP
resource "google_compute_address" "yuutai_ip" {
  name         = "yuutai-ip"
  address_type = "EXTERNAL"
  region       = var.region
}

# GCEインスタンス
resource "google_compute_instance" "yuutai_instance" {
  name         = "yuutai-app"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["http-server", "https-server", "ssh-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 20
    }
  }

  attached_disk {
    source      = google_compute_disk.yuutai_data.self_link
    device_name = "yuutai-data"
  }

  network_interface {
    network    = google_compute_network.yuutai_network.name
    subnetwork = google_compute_subnetwork.yuutai_subnet.name

    access_config {
      nat_ip = google_compute_address.yuutai_ip.address
    }
  }

  metadata = {
    ssh-keys = "ubuntu:${file("~/.ssh/id_rsa.pub")}"
  }

  # 起動スクリプト
  metadata_startup_script = <<-EOT
    #!/bin/bash
    apt-get update
    apt-get install -y docker.io docker-compose git
    
    # Dockerグループにubuntuユーザーを追加
    usermod -aG docker ubuntu
    
    # 永続ディスクのマウント
    mkdir -p /mnt/disks/yuutai-data
    mount /dev/disk/by-id/google-yuutai-data /mnt/disks/yuutai-data
    echo "/dev/disk/by-id/google-yuutai-data /mnt/disks/yuutai-data ext4 defaults,nofail 0 2" >> /etc/fstab
    
    # ディレクトリの作成
    mkdir -p /mnt/disks/yuutai-data/db
    mkdir -p /mnt/disks/yuutai-data/cache
    chown -R ubuntu:ubuntu /mnt/disks/yuutai-data
    
    # スワップファイルの作成
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  EOT

  service_account {
    scopes = [
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring.write",
      "https://www.googleapis.com/auth/devstorage.read_only",
    ]
  }

  labels = {
    environment = "production"
    app         = "yuutai"
  }

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
    preemptible         = false
  }
}

# Cloud Schedulerジョブ（オプション：定期的な再起動）
resource "google_cloud_scheduler_job" "restart_scraper" {
  name             = "yuutai-restart-scraper"
  description      = "毎日スクレイパーを再起動"
  schedule         = "0 3 * * *"  # 毎日午前3時（JST）
  time_zone        = "Asia/Tokyo"
  attempt_deadline = "320s"

  http_target {
    http_method = "POST"
    uri         = "https://compute.googleapis.com/compute/v1/projects/${var.project_id}/zones/${var.zone}/instances/yuutai-app/reset"
    
    oauth_token {
      service_account_email = google_service_account.scheduler_sa.email
    }
  }
}

# Cloud Scheduler用サービスアカウント
resource "google_service_account" "scheduler_sa" {
  account_id   = "yuutai-scheduler"
  display_name = "Yuutai Scheduler Service Account"
}

# サービスアカウントへの権限付与
resource "google_project_iam_member" "scheduler_compute_admin" {
  project = var.project_id
  role    = "roles/compute.instanceAdmin"
  member  = "serviceAccount:${google_service_account.scheduler_sa.email}"
}

# 出力
output "instance_ip" {
  value       = google_compute_address.yuutai_ip.address
  description = "インスタンスの外部IPアドレス"
}

output "ssh_command" {
  value       = "gcloud compute ssh ubuntu@${google_compute_instance.yuutai_instance.name} --zone=${var.zone} --project=${var.project_id}"
  description = "SSHアクセスコマンド"
}

output "app_url" {
  value       = "http://${google_compute_address.yuutai_ip.address}"
  description = "アプリケーションURL"
}