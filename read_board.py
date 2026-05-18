#!/usr/bin/env python3
"""
Тест: читает рукописный иврит с фото и произносит вслух.
Использование: python3 read_board.py <путь_к_фото>
"""

import sys
import base64
import subprocess
import os
import anthropic


def image_to_base64(path: str) -> tuple[str, str]:
    ext = os.path.splitext(path)[1].lower()
    mime = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".heic": "image/jpeg",  # конвертируем ниже
        ".webp": "image/webp",
    }.get(ext, "image/jpeg")

    # HEIC → JPEG через sips (встроено в macOS)
    if ext == ".heic":
        tmp = path.replace(".heic", "_converted.jpg")
        subprocess.run(["sips", "-s", "format", "jpeg", path, "--out", tmp],
                       capture_output=True)
        path = tmp
        mime = "image/jpeg"

    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode(), mime


def extract_hebrew_text(image_path: str) -> str:
    client = anthropic.Anthropic()

    img_b64, mime = image_to_base64(image_path)

    message = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime,
                            "data": img_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "זוהי תמונה של לוח או דף עם טקסט בעברית (כתב יד או דפוס).\n"
                            "אנא:\n"
                            "1. קרא את כל הטקסט העברי בתמונה.\n"
                            "2. החזר אותו בדיוק כפי שהוא כתוב, בסדר קריאה נכון (מימין לשמאל).\n"
                            "3. אל תוסיף הסברים, רק את הטקסט עצמו.\n"
                            "4. אם ישנם מספרים או נוסחאות, כתוב אותם כמות שהם.\n"
                            "5. אם הטקסט לא ברור, נסה לנחש בהגיון."
                        ),
                    },
                ],
            }
        ],
    )

    return message.content[0].text.strip()


def speak_hebrew(text: str):
    print("\n📢 מקריא:")
    print(text)
    print()
    subprocess.run(["say", "-v", "Carmit (Enhanced)", "-r", "150", text])


def main():
    if len(sys.argv) < 2:
        print("שימוש: python3 read_board.py <נתיב_לתמונה>")
        print("Usage: python3 read_board.py <path_to_image>")
        sys.exit(1)

    image_path = sys.argv[1]

    if not os.path.exists(image_path):
        print(f"❌ קובץ לא נמצא: {image_path}")
        sys.exit(1)

    print(f"🔍 מנתח תמונה: {image_path}")

    text = extract_hebrew_text(image_path)

    if not text:
        print("❌ לא נמצא טקסט בתמונה")
        sys.exit(1)

    speak_hebrew(text)
    print("✅ סיום")


if __name__ == "__main__":
    main()
