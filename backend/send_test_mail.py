"""发一封测试信，检查 163 SMTP 配置是否可用。

用法（仓库根目录，会自动读取 backend/.env）：

    py -3 -m backend.send_test_mail 你的邮箱@whu.edu.cn

它会打印 SMTP 主机、发件人和投递结果；任何一步失败都会给出原始错误，
对照 backend/README.md 的「163 邮箱配置」一节排查即可。
"""
import sys
from pathlib import Path

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass

from .core import Problem, smtp_send  # noqa: E402 - 先改输出编码，避免 Windows 控制台乱码
from .server import load_env  # noqa: E402


def main():
    if len(sys.argv) != 2 or '@' not in sys.argv[1]:
        print('用法: py -3 -m backend.send_test_mail 收件邮箱')
        return 2
    load_env(Path(__file__).parent / '.env')
    import os
    host, user, target = os.getenv('SMTP_HOST', ''), os.getenv('SMTP_USER', ''), sys.argv[1]
    print(f'SMTP_HOST={host} SMTP_PORT={os.getenv("SMTP_PORT", "465")} SMTP_USER={user}')
    print(f'SMTP_FROM={os.getenv("SMTP_FROM") or user} MAIL_DEBUG={os.getenv("MAIL_DEBUG", "0")}')
    try:
        smtp_send(target, '123456')
    except Problem as e:
        print(f'配置缺失: {e.message}')
        return 1
    except Exception as e:  # noqa: BLE001 - 原样打印，方便对照 535/553 等错误码
        print(f'发送失败: {type(e).__name__}: {e}')
        return 1
    print(f'已投递到 {target}，请检查收件箱和垃圾邮件目录')
    return 0


if __name__ == '__main__':
    sys.exit(main())
