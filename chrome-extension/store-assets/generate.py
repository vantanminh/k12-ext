"""Generate Chrome Web Store assets (icon, screenshots, promo tiles). Run: python generate.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
F = "C:/Windows/Fonts/"
ACCENT, ACCENT2, DARK = (15, 118, 110), (13, 148, 136), (8, 60, 56)
BG, SURFACE, BORDER = (243, 246, 245), (255, 255, 255), (225, 233, 229)
TEXT, TEXT2, MUTED, SOFT = (21, 35, 30), (77, 98, 90), (123, 140, 133), (231, 245, 241)


def font(size, weight="r"):
    name = {"r": "segoeui.ttf", "b": "segoeuib.ttf", "sb": "seguisb.ttf", "l": "segoeuil.ttf"}[weight]
    try:
        return ImageFont.truetype(F + name, size)
    except OSError:
        return ImageFont.truetype(F + "segoeuib.ttf" if weight != "r" else F + "segoeui.ttf", size)


def gradient(w, h, c1, c2):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / w * 0.6 + y / h * 0.4)
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return img


def logo(size):
    """Rounded teal square with a play triangle and a check badge."""
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    g = gradient(s, s, ACCENT2, DARK).convert("RGBA")
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=255)
    img.paste(g, (0, 0), mask)
    d = ImageDraw.Draw(img)
    # play triangle
    d.polygon([(s * .33, s * .26), (s * .33, s * .74), (s * .74, s * .50)], fill=(255, 255, 255))
    # check badge
    cx, cy, r = s * .74, s * .74, s * .17
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(250, 204, 21), outline=(255, 255, 255), width=int(s * .03))
    d.line([(cx - r * .5, cy), (cx - r * .1, cy + r * .4), (cx + r * .55, cy - r * .4)],
           fill=DARK, width=int(s * .045), joint="curve")
    return img.resize((size, size), Image.LANCZOS)


def store_icon():
    # 128x128 with 16px transparent padding, per Chrome guidelines (96px artwork)
    icon = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    icon.alpha_composite(logo(96), (16, 16))
    icon.save(OUT / "icon-128.png")
    for s in (16, 32, 48):
        logo(s).save(OUT / f"icon-{s}.png")


def rr(d, box, fill, r=12, outline=None):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=1 if outline else 0)


def button(d, x, y, w, label, primary=False, h=40):
    rr(d, (x, y, x + w, y + h), ACCENT if primary else SURFACE, 10, None if primary else BORDER)
    f = font(15, "sb")
    tw = d.textlength(label, font=f)
    d.text((x + (w - tw) / 2, y + h / 2), label, font=f, fill=(255, 255, 255) if primary else TEXT, anchor="lm")


def sidepanel(img, x0, tab, content):
    d = ImageDraw.Draw(img)
    w, h = img.width - x0, img.height
    d.rectangle((x0, 0, img.width, h), fill=BG)
    d.line((x0, 0, x0, h), fill=BORDER)
    img.alpha_composite(logo(34), (x0 + 20, 18)) if img.mode == "RGBA" else img.paste(logo(34), (x0 + 20, 18), logo(34))
    d.text((x0 + 64, 35), "K12 Video Runner", font=font(19, "b"), fill=TEXT, anchor="lm")
    tabs = ["Chọn bài", "Quản lý", "AI bài tập"]
    tx = x0 + 20
    rr(d, (tx, 68, x0 + w - 20, 108), (230, 237, 234), 10)
    tw = (w - 48) / 3
    for i, t in enumerate(tabs):
        bx = tx + 4 + i * tw
        if i == tab:
            rr(d, (bx, 72, bx + tw - 4, 104), SURFACE, 8)
        d.text((bx + tw / 2 - 2, 88), t, font=font(14, "sb"), fill=ACCENT if i == tab else TEXT2, anchor="mm")
    content(d, x0 + 20, 124, w - 40)


def lessons_content(d, x, y, w):
    rr(d, (x, y, x + w, y + 500), SURFACE, 12, BORDER)
    d.text((x + 16, y + 26), "Bài học trên trang", font=font(17, "b"), fill=TEXT, anchor="lm")
    d.text((x + 16, y + 50), "Môn học: Toán học", font=font(13), fill=MUTED, anchor="lm")
    items = [("Bài 1. Tập hợp", "Video · Tài liệu", True, "Hoàn thành"),
             ("Bài 2. Các phép toán", "Video · Bài tập", True, "Đang chạy"),
             ("Bài 3. Mệnh đề", "Video · Bài tập", True, ""),
             ("Bài 4. Bất phương trình", "Tài liệu", False, ""),
             ("Bài 5. Hệ phương trình", "Video", False, "")]
    yy = y + 76
    for name, meta, chk, status in items:
        rr(d, (x + 12, yy, x + w - 12, yy + 56), (248, 251, 250), 10, BORDER)
        rr(d, (x + 26, yy + 18, x + 46, yy + 38), ACCENT if chk else SURFACE, 5, None if chk else (199, 216, 209))
        if chk:
            d.line([(x + 30, yy + 28), (x + 35, yy + 33), (x + 42, yy + 23)], fill="white", width=3)
        d.text((x + 58, yy + 19), name, font=font(15, "sb"), fill=TEXT, anchor="lm")
        d.text((x + 58, yy + 39), meta, font=font(12), fill=MUTED, anchor="lm")
        if status:
            f = font(12, "sb")
            sw = d.textlength(status, font=f) + 20
            col = (232, 246, 241) if status == "Hoàn thành" else (254, 243, 199)
            fg = ACCENT if status == "Hoàn thành" else (146, 64, 14)
            rr(d, (x + w - 24 - sw, yy + 16, x + w - 24, yy + 40), col, 12)
            d.text((x + w - 24 - sw / 2, yy + 28), status, font=f, fill=fg, anchor="mm")
        yy += 64
    button(d, x + 12, yy + 6, w - 24, "Chạy quy trình theo môn cho bài đã chọn", True)
    button(d, x + 12, yy + 54, (w - 32) / 2, "Xem trước")
    button(d, x + 20 + (w - 32) / 2, yy + 54, (w - 32) / 2, "Giải bằng AI")


def ai_content(d, x, y, w):
    rr(d, (x, y, x + w, y + 560), SURFACE, 12, BORDER)
    d.text((x + 16, y + 26), "AI bài tập", font=font(17, "b"), fill=TEXT, anchor="lm")
    rr(d, (x + 16, y + 48, x + w - 16, y + 80), SOFT, 8)
    d.text((x + 28, y + 64), "● Server sẵn sàng · Đã đăng nhập", font=font(13, "sb"), fill=ACCENT, anchor="lm")
    button(d, x + 16, y + 96, w - 32, "Đọc đề trên trang hiện tại và giải", True)
    d.text((x + 16, y + 162), "Kết quả gần nhất", font=font(14, "b"), fill=TEXT, anchor="lm")
    qs = [("Câu 1", "B"), ("Câu 2", "A"), ("Câu 3", "D"), ("Câu 4", "C"), ("Câu 5", "A"), ("Câu 6", "B")]
    yy = y + 182
    for q, a in qs:
        rr(d, (x + 16, yy, x + w - 16, yy + 44), (248, 251, 250), 8, BORDER)
        d.text((x + 30, yy + 22), q, font=font(14, "sb"), fill=TEXT, anchor="lm")
        d.text((x + 100, yy + 22), "Trắc nghiệm · độ tin cậy cao", font=font(12), fill=MUTED, anchor="lm")
        d.ellipse((x + w - 58, yy + 8, x + w - 30, yy + 36), fill=ACCENT)
        d.text((x + w - 44, yy + 22), a, font=font(14, "b"), fill="white", anchor="mm")
        yy += 52
    button(d, x + 16, yy + 10, w - 32, "Xuất đáp án AI gần nhất")


def manage_content(d, x, y, w):
    rr(d, (x, y, x + w, y + 400), SURFACE, 12, BORDER)
    d.text((x + 16, y + 26), "Quản lý extension", font=font(17, "b"), fill=TEXT, anchor="lm")
    rows = [("Tự động bình luận sau bài học", True), ("Bỏ qua video đã xem", True),
            ("Hiển thị thông báo khi xong", False), ("Ghi dữ liệu API để gỡ lỗi", False)]
    yy = y + 60
    for label, on in rows:
        d.text((x + 16, yy + 16), label, font=font(15), fill=TEXT, anchor="lm")
        rr(d, (x + w - 64, yy + 4, x + w - 20, yy + 28), ACCENT if on else (199, 216, 209), 12)
        cx = x + w - 32 if on else x + w - 52
        d.ellipse((cx - 9, yy + 7, cx + 9, yy + 25), fill="white")
        yy += 52
        d.line((x + 16, yy - 8, x + w - 16, yy - 8), fill=BORDER)
    d.text((x + 16, yy + 20), "Tiến độ hôm nay", font=font(14, "b"), fill=TEXT, anchor="lm")
    rr(d, (x + 16, yy + 40, x + w - 16, yy + 52), (230, 237, 234), 6)
    rr(d, (x + 16, yy + 40, x + 16 + (w - 32) * .72, yy + 52), ACCENT2, 6)
    d.text((x + 16, yy + 72), "18 / 25 bài đã hoàn thành", font=font(13), fill=MUTED, anchor="lm")


def browser_page(img, x1, title, variant):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, img.width, 44), fill=(222, 227, 231))
    rr(d, (12, 8, 260, 44), (243, 246, 245), 10)
    d.text((28, 26), "K12Online – Học trực tuyến", font=font(13), fill=TEXT, anchor="lm")
    d.rectangle((0, 44, img.width, 88), fill=(243, 246, 245))
    rr(d, (96, 52, x1 - 20, 80), SURFACE, 14)
    d.text((116, 66), "hcm.k12online.vn/lop-hoc/toan-10", font=font(13), fill=TEXT2, anchor="lm")
    for i in range(3):
        d.ellipse((18 + i * 24, 60, 30 + i * 24, 72), fill=(160, 170, 175))
    d.rectangle((0, 88, x1, img.height), fill=(250, 251, 252))
    d.rectangle((0, 88, x1, 140), fill=(30, 64, 124))
    d.text((32, 114), "K12Online", font=font(20, "b"), fill="white", anchor="lm")
    d.text((32, 176), title, font=font(24, "b"), fill=TEXT, anchor="lm")
    if variant == "video":
        rr(d, (32, 206, x1 - 32, 206 + (x1 - 64) * 9 // 16), (20, 24, 28), 12)
        vh = (x1 - 64) * 9 // 16
        cx, cy = x1 // 2, 206 + vh // 2
        d.ellipse((cx - 36, cy - 36, cx + 36, cy + 36), fill=(255, 255, 255, 220))
        d.polygon([(cx - 10, cy - 18), (cx - 10, cy + 18), (cx + 20, cy)], fill=(20, 24, 28))
        rr(d, (52, 206 + vh - 30, x1 - 52, 206 + vh - 24), (80, 80, 80), 3)
        rr(d, (52, 206 + vh - 30, 52 + (x1 - 104) * .64, 206 + vh - 24), ACCENT2, 3)
    else:
        yy = 210
        for i in range(4):
            rr(d, (32, yy, x1 - 32, yy + 120), SURFACE, 12, BORDER)
            d.text((52, yy + 28), f"Câu {i + 1}.", font=font(16, "b"), fill=TEXT, anchor="lm")
            rr(d, (130, yy + 22, x1 - 120, yy + 34), (228, 232, 236), 6)
            for j, opt in enumerate("ABCD"):
                ox = 52 + j * ((x1 - 104) // 4)
                picked = opt == "BADC"[i]
                d.ellipse((ox, yy + 70, ox + 22, yy + 92), fill=ACCENT if picked else SURFACE,
                          outline=ACCENT if picked else (190, 198, 204), width=2)
                d.text((ox + 32, yy + 81), f"{opt}. ______", font=font(14), fill=TEXT2, anchor="lm")
            yy += 136


def screenshot(name, title, variant, tab, content, caption):
    img = Image.new("RGBA", (1280, 800), (255, 255, 255, 255))
    x0 = 1280 - 420
    browser_page(img, x0, title, variant)
    sidepanel(img, x0, tab, content)
    d = ImageDraw.Draw(img)
    # caption banner
    f = font(18, "sb")
    cw = d.textlength(caption, font=f) + 40
    rr(d, (32, 800 - 64, 32 + cw, 800 - 20), ACCENT, 22)
    d.text((52, 800 - 42), caption, font=f, fill="white", anchor="lm")
    img.convert("RGB").save(OUT / name)


def chip(img, box, r):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius=r, fill=(255, 255, 255, 40))
    img.alpha_composite(layer)


def promo(w, h, name):
    base = gradient(w, h, ACCENT2, DARK).convert("RGBA")
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i in range(6):  # soft decorative circles
        r = h * (0.35 + i * 0.12)
        d.ellipse((w - r * .9, -r * .4, w + r * 1.1, r * 1.6), outline=(255, 255, 255, 18), width=2)
    ls = int(h * 0.30)
    base.alpha_composite(img)
    img = base
    d = ImageDraw.Draw(img)
    img.alpha_composite(logo(ls), (int(h * .11), int(h * .12)))
    title_f, sub_f = font(int(h * .13), "b"), font(int(h * .065))
    tx = int(h * .11)
    d.text((tx, int(h * .56)), "K12 Video Runner", font=title_f, fill="white", anchor="ls")
    d.text((tx, int(h * .70)), "Học K12Online nhanh hơn từ sidebar Chrome", font=sub_f, fill=(220, 245, 240), anchor="ls")
    if w > 1000:  # marquee: add feature chips and a mini panel
        chips = ["Chọn bài theo môn", "Hoàn thành video", "AI bài tập"]
        cx = tx
        for c in chips:
            f = font(24, "sb")
            cw = d.textlength(c, font=f) + 44
            chip(img, (cx, int(h * .79), cx + cw, int(h * .79) + 48), 24)
            d.text((cx + 22, int(h * .79) + 24), c, font=f, fill="white", anchor="lm")
            cx += cw + 14
        panel = Image.new("RGBA", (380, 500), (0, 0, 0, 0))
        sidepanel(panel, 0, 0, lessons_content)
        pm = Image.new("L", panel.size, 0)
        ImageDraw.Draw(pm).rounded_rectangle((0, 0, 379, 499), radius=18, fill=255)
        shadow = Image.new("RGBA", (400, 520), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle((10, 14, 390, 514), radius=20, fill=(0, 0, 0, 70))
        img.alpha_composite(shadow, (w - 470, 40))
        img.paste(panel, (w - 470, 30), pm)
    else:
        sub_f2 = font(int(h * .06), "sb")
        chip(img, (tx, int(h * .78), tx + d.textlength("Video · Tài liệu · AI bài tập", font=sub_f2) + 36,
                   int(h * .78) + int(h * .11)), 20)
        d.text((tx + 18, int(h * .78) + int(h * .055)), "Video · Tài liệu · AI bài tập", font=sub_f2, fill="white", anchor="lm")
    img.convert("RGB").save(OUT / name)


if __name__ == "__main__":
    store_icon()
    screenshot("screenshot-1.png", "Toán 10 – Danh sách bài học", "video", 0, lessons_content,
               "Chọn nhiều bài và chạy quy trình theo môn chỉ với một nút")
    screenshot("screenshot-2.png", "Bài 2. Các phép toán – Bài tập", "quiz", 2, ai_content,
               "Đọc đề và gợi ý đáp án bằng AI ngay trên trang")
    screenshot("screenshot-3.png", "Bài 1. Tập hợp – Video", "video", 1, manage_content,
               "Tùy chỉnh và theo dõi tiến độ học")
    promo(440, 280, "promo-small-440x280.png")
    promo(1400, 560, "promo-marquee-1400x560.png")
    print("done")
