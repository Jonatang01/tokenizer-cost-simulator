$ports = @(3000, 8020, 8004, 8010)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        Write-Host "Port $port: free"
        continue
    }

    foreach ($connection in $connections) {
        $pid = $connection.OwningProcess
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Port $port: PID $pid $($process.ProcessName) $($process.Path)"
        } else {
            Write-Host "Port $port: PID $pid not visible"
        }
    }
}
