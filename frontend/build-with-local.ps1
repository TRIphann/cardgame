$env:VITE_API_BASE_URL = "http://localhost:5000"
Write-Host "Setting env: $env:VITE_API_BASE_URL"
& npx vite build
