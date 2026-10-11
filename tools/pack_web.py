# 把应用本体（index.html + css + js + samples + assets）打包进 web/，供 Capacitor 使用。
# 桌面版与服务这两个入口直接读仓库根目录；APK 是第三个入口，吃这份拷贝。
# 应用本体只有这一份源，web/ 永远是产物——改完跑 npm run sync 重新生成。
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
COPY_ITEMS = ["index.html", "css", "js", "samples", "assets"]

def main():
    if WEB.exists():
        shutil.rmtree(WEB)
    WEB.mkdir()
    total = 0
    for item in COPY_ITEMS:
        src = ROOT / item
        dst = WEB / item
        if src.is_dir():
            shutil.copytree(src, dst)
            n = sum(1 for p in dst.rglob("*") if p.is_file())
        else:
            shutil.copy2(src, dst)
            n = 1
        total += n
        print(f"  {item}: {n} 个文件")
    print(f"web/ 打包完成，共 {total} 个文件")

if __name__ == "__main__":
    main()
