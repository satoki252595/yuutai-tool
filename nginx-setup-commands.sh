#!/bin/bash

# Start Nginx service
sudo systemctl start nginx

# Enable Nginx to start on boot
sudo systemctl enable nginx

# Check Nginx status
sudo systemctl status nginx

# Reload Nginx configuration
sudo nginx -s reload

# Alternative reload command
sudo systemctl reload nginx

# Test Nginx configuration (optional but recommended)
sudo nginx -t