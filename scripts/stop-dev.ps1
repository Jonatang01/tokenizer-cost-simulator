$ports = @(3000, 8020, 8004, 8010)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $pid = $connection.OwningProcess
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Stopping port $port PID $pid ($($process.ProcessName))"
            Stop-Process -Id $pid -Force
        } else {
            Write-Host "Port $port reports PID $pid, but no process is visible."
        }
    }
}

Write-Host "Dev ports checked."
