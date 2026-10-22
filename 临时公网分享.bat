@echo off
chcp 65001 >nul
echo 请先在另一个窗口运行“启动游戏.bat”。
echo 下面的地址关闭本窗口后就会失效。
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=20 -R 80:127.0.0.1:4173 serveo.net
pause
