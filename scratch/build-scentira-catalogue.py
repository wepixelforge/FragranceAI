#!/usr/bin/env python3
"""Build verified Scentira catalogue TS from official Shopify product data."""

from __future__ import annotations

import json
import os
import re
import ssl
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path("/Users/tanmaymehta/Desktop/untitled folder/fragrance-ai-demo")
INDEX_PATH = ROOT / "scratch/scentira-raw/index.json"
OUT_PRODUCTS = ROOT / "src/data/products/scentira-products.ts"
OUT_IMAGES = ROOT / "src/data/products/scentira-images.ts"
CACHE = ROOT / "scratch/scentira-raw/pdp"

# Explicit (handle, variant_title) list. Only these SKUs are emitted.
# Variant titles must match Shopify exactly.
SKUS: list[tuple[str, str, dict]] = [
    # Khamrah lineage + set
    ("lattafa-khamrah-waha-eau-de-parfum", "Tester Sample (1.5mL)", {"featured": False, "skip_if_free": True}),
    ("lattafa-khamrah-waha-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("lattafa-khamrah-waha-eau-de-parfum", "10mL Decant", {"featured": True}),
    ("lattafa-khamrah-waha-eau-de-parfum", "20mL Decant", {"featured": False}),
    ("lattafa-khamrah-waha-eau-de-parfum", "Retail Bottle (100 mL)", {"featured": False}),
    ("lattafa-khamrah-dukhan-eau-de-parfum", "Retail Bottle (100 mL)", {"featured": False}),
    ("khamrah-sample-set-qahwa-khamrah-waha-3-x-1-5ml", "3x1.5mL Samples (45 Sprays Total)", {"featured": True}),
    # Hawas / fresh ME
    ("rasasi-hawas-nautilus-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("rasasi-hawas-nautilus-eau-de-parfum", "10mL Decant", {"featured": True}),
    ("rasasi-hawas-tropical-eau-de-parfum", "10mL Decant", {"featured": False}),
    ("my-perfumes-leather-of-men-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("ajmal-wave-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("ajmal-cyan-oud-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("arabiyat-prestige-raees-aurum-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("rayhaan-tropical-vibe-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("fragrance-world-tabac-n-coke-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("french-avenue-liquid-brun-limited-edition-extrait-de-parfum", "10mL Decant", {"featured": False}),
    # Marwa / Yara / Asad
    ("arabiyat-prestige-marwa-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("lattafa-yara-moi-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("lattafa-asad-zanzibar-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("lattafa-asad-sample-set-asad-zanzibar-asad-elixir-asad-bourbon-3-1-5ml", "Default Title", {"featured": False}),
    # More ME
    ("armaf-club-de-nuit-sillage-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("lattafa-fakhar-platin-eau-de-parfum", "10mL Decant", {"featured": False}),
    ("lattafa-eclaire-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("afnan-9pm-elixir-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("afnan-turathi-blue-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("al-majed-oud-boisee-extrait-de-parfum", "5mL Decant", {"featured": False}),
    ("lattafa-badee-al-oud-amethyst-eau-de-parfum", "10mL Decant", {"featured": False}),
    ("riiffs-freeze-extrait-de-parfum", "5mL Decant", {"featured": False}),
    ("riiffs-costa-de-amalfi-extrait-de-parfum", "5mL Decant", {"featured": False}),
    # Discovery sets
    ("lattafa-signature-sample-set-yara-angham-eclaire-her-confession-khamrah-qahwa-5-1-5ml", "Default Title", {"featured": False}),
    ("summer-freshies-sample-set-hawas-ice-marwa-mykonos-reflection-3-1-5ml", "Default Title", {"featured": True}),
    ("afnan-woody-essentials-sample-set-tribute-blue-highness-x-turathi-blue-3-1-5ml", "Default Title", {"featured": False}),
    ("zimaya-tiramisu-sample-set-tiramisu-s-mores-tiramisu-caramel-tiramisu-coco-3-1-5ml", "Default Title", {"featured": False}),
    ("everyday-fresh-sample-set-hamdan-the-sheikh-kuro-modest-une-3-1-5ml", "Default Title", {"featured": False}),
    # Designer
    ("hermes-terre-dhermes-eau-de-toilette", "5mL Decant", {"featured": False}),
    ("guerlain-l-homme-ideal-parfum", "5mL Decant", {"featured": False}),
    ("calvin-klein-eternity-for-women-eau-de-parfum", "Retail Bottle (100 mL)", {"featured": False}),
    ("calvin-klein-classics-sample-set-eternity-for-men-edt-ck-one-ck-one-shock-3-1-5ml", "Default Title", {"featured": False}),
    ("dolce-gabbana-light-blue-eau-de-toilette-2025-launch", "Retail Bottle (100 mL)", {"featured": False}),
    ("giorgio-armani-acqua-di-gioia-eau-de-parfum", "10mL Decant", {"featured": False}),
    ("giorgio-armani-stronger-with-you-powerfully-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("burberry-hero-eau-de-toilette", "5mL Decant", {"featured": False}),
    ("gucci-guilty-absolu-de-parfum-pour-femme", "5mL Decant", {"featured": False}),
    ("versace-eros-najim-pour-homme-parfum", "5mL Decant", {"featured": False}),
    ("mont-blanc-explorer-eau-de-parfum", "Retail Bottle (100 ML)", {"featured": False}),
    ("bundle-name-sku-in-stock-status-actions-ysl-y-sample-set-y-le-parfum-y-edp-intense-y-iced-cologne-3-1-5ml", "3x1.5mL Samples (45 Sprays Total)", {"featured": False}),
    # Niche / luxury
    ("maison-francis-kurkdijan-baccarat-rouge-540-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("ex-nihilo-blue-talisman-extrait-de-parfum", "5mL Decant", {"featured": False}),
    ("maison-crivelli-oud-cadenza-extrait-de-parfum", "5mL Decant", {"featured": False}),
    ("creed-aventus-eau-de-parfum-official-vial-1-7-ml", "Official Vial (1.7 mL)", {"featured": False}),
    ("creed-classics-sample-set-aventus-edp-green-irish-tweed-royal-mayfair-3-1-5ml", "3x1.5mL Samples (45 Sprays Total)", {"featured": False}),
    ("maison-margiela-replica-by-the-fireplace-eau-de-toilette", "10mL Decant", {"featured": False}),
    ("diptyque-tam-dao-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("byredo-gypsy-water-eau-de-parfum", "5mL Decant", {"featured": False}),
    ("mens-office-classics-sample-set-terre-dhermes-parfum-bois-imperial-montblanc-explorer-3-1-5ml", "Default Title", {"featured": False}),
    ("maison-margiel-beach-walk-eau-de-toilette", "10mL Decant", {"featured": False}),
]

SCENT_TO_FAMILY = {
    "scent-fresh-citrus": ["fresh", "citrus"],
    "scent-fresh": ["fresh"],
    "scent-citrus": ["citrus"],
    "scent-aquatic": ["aquatic"],
    "scent-woody": ["woody"],
    "scent-sandalwood": ["woody"],
    "scent-aromatic-spicy": ["aromatic", "spicy"],
    "scent-spicy": ["spicy"],
    "scent-sweet": ["sweet"],
    "scent-vanilla": ["sweet"],
    "scent-gourmand": ["gourmand"],
    "scent-sweet-gourmand": ["gourmand"],
    "scent-floral": ["floral"],
    "scent-jasmine": ["floral"],
    "scent-rose": ["floral"],
    "scent-amber": ["oriental"],
    "scent-oud": ["oud"],
    "scent-musk": ["musky"],
    "scent-fruity": ["fruity"],
    "scent-green": ["green"],
    "scent-leather": ["woody"],
}

OCCASION_MAP = {
    "occasion-daily": "daily",
    "occasion-office": "office",
    "occasion-date-night": "date-night",
    "occasion-evening": "evening",
    "occasion-wedding": "wedding",
    "occasion-casual": "casual",
    "occasion-gym": "gym",
    "occasion-party": "party",
    "occasion-formal": "formal",
    "occasion-travel": "travel",
}

SEASON_MAP = {
    "season-summer": "summer",
    "season-winter": "winter",
    "season-spring": "spring",
    "season-autumn": "autumn",
}

CTX = ssl.create_default_context()


class HTMLText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self.parts)).strip()


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=CTX, timeout=30) as res:
        return res.read()


_KNOWN_OK: set[str] = set()
try:
    _prev = (ROOT / "src/data/products/scentira-images.ts").read_text()
    _KNOWN_OK.update(re.findall(r"https://cdn\.shopify\.com[^\"']+", _prev))
except Exception:
    pass


def head_ok(url: str) -> bool:
    if url in _KNOWN_OK:
        return True
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=20) as res:
            return 200 <= res.status < 400
    except Exception:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, context=CTX, timeout=20) as res:
                return 200 <= res.status < 400
        except Exception:
            return False


def load_index() -> dict:
    rows = json.loads(INDEX_PATH.read_text())
    return {r["handle"]: r for r in rows}


def load_pdp(handle: str) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{handle}.json"
    if path.exists() and path.stat().st_size > 200:
        return json.loads(path.read_text())["product"]
    raw = fetch(f"https://scentira.in/products/{handle}.json")
    path.write_bytes(raw)
    time.sleep(0.15)
    return json.loads(raw)["product"]


def parse_tags(tag_str: str) -> list[str]:
    return [t.strip().lower() for t in (tag_str or "").split(",") if t.strip()]


def gender_from_tags(tags: list[str]) -> str:
    men = "mens" in tags or "men" in tags
    women = "womens" in tags or "women" in tags
    if men and women:
        return "unisex"
    if men:
        return "men"
    if women:
        return "women"
    return "unisex"


TITLE_FAMILY_WORDS = {
    "fresh": "fresh",
    "woody": "woody",
    "floral": "floral",
    "oud": "oud",
    "citrus": "citrus",
    "aquatic": "aquatic",
    "gourmand": "gourmand",
    "spicy": "spicy",
    "sweet": "sweet",
}


def families_from_tags(tags: list[str], title: str) -> list[str]:
    found: list[str] = []
    for tag, fams in SCENT_TO_FAMILY.items():
        if tag in tags:
            for f in fams:
                if f not in found:
                    found.append(f)
    title_l = title.lower()
    for word, fam in TITLE_FAMILY_WORDS.items():
        if re.search(rf"\b{word}\b", title_l) and fam not in found:
            found.append(fam)
    return found


def occasions_from_tags(tags: list[str]) -> list[str]:
    out = []
    for tag, occ in OCCASION_MAP.items():
        if tag in tags and occ not in out:
            out.append(occ)
    return out


def seasons_from_tags(tags: list[str]) -> list[str]:
    out = []
    for tag, season in SEASON_MAP.items():
        if tag in tags and season not in out:
            out.append(season)
    if len(out) >= 4:
        return ["all-season"]
    return out


def concentration_from_title(title: str) -> str | None:
    if re.search(r"extrait", title, re.I):
        return "Extrait"
    if re.search(r"\bparfum\b", title, re.I) and not re.search(r"eau de parfum", title, re.I):
        return "Parfum"
    if re.search(r"eau de parfum|\bEDP\b", title, re.I):
        return "EDP"
    if re.search(r"eau de toilette|\bEDT\b", title, re.I):
        return "EDT"
    return None


def classify_variant(variant_title: str, product_type: str, product_title: str, handle: str = "") -> tuple[str, str, list[str]]:
    vt = variant_title.lower()
    pt = (product_type or "").lower()
    blob = f"{product_title} {handle} {variant_title}".lower()
    if pt == "bundle" or "sample set" in blob or "discovery set" in blob or re.search(r"\d+\s*x\s*1\.5", vt):
        if "5x" in vt or "5 x" in vt or "5-1-5" in blob or "5 x 1.5" in blob:
            size = "5x1.5ml discovery set"
        else:
            size = "3x1.5ml discovery set"
        return "discovery-set", size, ["discovery-set"]
    if "official vial" in vt:
        return "vial", "1.7ml official vial", ["official-vial"]
    if "1.5" in vt and "tester" in vt:
        return "vial", "1.5ml tester", ["tester", "discovery"]
    if re.search(r"5\s*ml decant", vt) and "1.5" not in vt:
        return "miniature", "5ml decant", ["decant"]
    if re.search(r"10\s*ml decant", vt):
        return "pocket", "10ml decant", ["decant"]
    if re.search(r"20\s*ml decant", vt):
        return "pocket", "20ml decant", ["decant"]
    m = re.search(r"retail bottle \((\d+)\s*m[lL]\)", vt)
    if m:
        return "full-size", f"{m.group(1)}ml bottle", ["full-bottle"]
    raise ValueError(f"Unmapped variant: {variant_title}")


def factual_description(body: str, title: str, size: str) -> str:
    text = body.strip()
    if not text:
        return f"{title} — {size}, listed on Scentira."
    # Keep two short sentences max, no marketing adjectives we add ourselves.
    sentences = re.split(r"(?<=[.!?])\s+", text)
    keep = []
    banned = re.compile(r"\b(best seller|beast mode|luxury quality|perfect for everyone|long-lasting|better than)\b", re.I)
    for s in sentences:
        s = s.strip()
        if not s or banned.search(s):
            continue
        keep.append(s)
        if len(keep) == 2:
            break
    desc = " ".join(keep) if keep else f"{title} — {size}, listed on Scentira."
    if len(desc) > 320:
        # Keep complete sentences only.
        clipped = []
        total = 0
        for sentence in keep:
            if total + len(sentence) + 1 > 320:
                break
            clipped.append(sentence)
            total += len(sentence) + 1
        desc = " ".join(clipped) if clipped else keep[0]
    return desc


def parse_notes(body: str) -> tuple[list[str], list[str], list[str]]:
    top, heart, base = [], [], []
    patterns = [
        (r"top notes?[:\s]+([^.]{3,160})", "top"),
        (r"heart notes?[:\s]+([^.]{3,160})", "heart"),
        (r"middle notes?[:\s]+([^.]{3,160})", "heart"),
        (r"base notes?[:\s]+([^.]{3,160})", "base"),
    ]
    for pat, kind in patterns:
        m = re.search(pat, body, re.I)
        if not m:
            continue
        notes = [n.strip(" .") for n in re.split(r",| and ", m.group(1)) if n.strip()]
        notes = [n for n in notes if 1 < len(n) < 40]
        if kind == "top":
            top = notes[:4]
        elif kind == "heart":
            heart = notes[:4]
        else:
            base = notes[:4]
    return top, heart, base


def js_str(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def js_arr(values: list) -> str:
    return "[" + ", ".join(js_str(v) for v in values) + "]"


def slugify(handle: str, variant_title: str) -> str:
    vt = variant_title.lower()
    suffix = ""
    if "1.5" in vt and "tester" in vt:
        suffix = "-1-5ml"
    elif "official vial" in vt:
        suffix = "-1-7ml"
    elif "5ml decant" in vt:
        suffix = "-5ml"
    elif "10ml decant" in vt:
        suffix = "-10ml"
    elif "20ml decant" in vt:
        suffix = "-20ml"
    elif "retail" in vt:
        m = re.search(r"(\d+)", vt)
        suffix = f"-{m.group(1)}ml" if m else "-bottle"
    elif "3x" in vt or "default title" in vt or "5x" in vt:
        suffix = ""
    base = handle
    # shorten ugly bundle handle
    if base.startswith("bundle-name-"):
        base = "ysl-y-discovery-set"
    if base.startswith("maison-francis-kurkdijan"):
        base = base.replace("maison-francis-kurkdijan", "mfk")
    if base.startswith("maison-margiel-"):
        base = base.replace("maison-margiel-", "maison-margiela-")
    return (base + suffix).strip("-")


def lineage_id(handle: str, fmt: str) -> str | None:
    if fmt == "discovery-set":
        return None
    return "scentira-" + handle


def house_brand(vendor: str, fmt: str) -> str:
    if not vendor or vendor.lower() == "scentira":
        return "Scentira"
    return vendor.title() if vendor.isupper() else vendor


def image_is_generic_or_wrong(src: str, title: str) -> bool:
    s = src.lower()
    t = title.lower()
    if any(x in s for x in ["decant_cases", "case_in_bag", "case_in_pocket", "single_case", "bento_tiles"]):
        return True
    if "attar" in s and "attar" not in t:
        return True
    return False


def variant_image(pdp: dict, variant: dict) -> str:
    images = pdp.get("images") or []
    title = pdp.get("title") or ""
    featured = (pdp.get("image") or {}).get("src")
    image_id = variant.get("image_id")
    if image_id:
        for img in images:
            if img.get("id") == image_id and not image_is_generic_or_wrong(img.get("src") or "", title):
                return img["src"]
    if featured and not image_is_generic_or_wrong(featured, title):
        return featured
    for img in images:
        if not image_is_generic_or_wrong(img.get("src") or "", title):
            return img["src"]
    raise ValueError("No official product image")


def find_index_variant(index_row: dict, variant_title: str) -> dict | None:
    for v in index_row["variants"]:
        if v["title"] == variant_title:
            return v
    return None


def main() -> None:
    index = load_index()
    products = []
    images: dict[str, str] = {}
    rejected = []
    n = 0

    for handle, variant_title, meta in SKUS:
        row = index.get(handle)
        if not row:
            rejected.append((handle, variant_title, "missing from catalogue dump"))
            continue
        iv = find_index_variant(row, variant_title)
        if not iv:
            rejected.append((handle, variant_title, "variant not in dump"))
            continue
        price = float(iv["price"] or 0)
        if meta.get("skip_if_free") and price <= 0:
            rejected.append((handle, variant_title, "free tester skipped"))
            continue
        if price <= 0:
            rejected.append((handle, variant_title, "price is 0"))
            continue
        if not iv.get("available"):
            rejected.append((handle, variant_title, "not available"))
            continue

        pdp = load_pdp(handle)
        pdp_variant = next((v for v in pdp["variants"] if v["title"] == variant_title), None)
        if not pdp_variant:
            rejected.append((handle, variant_title, "variant missing on PDP json"))
            continue
        pdp_price = float(pdp_variant["price"])
        if abs(pdp_price - price) > 0.01:
            # Prefer live PDP price if it differs; still verified official
            price = pdp_price

        tags = parse_tags(pdp.get("tags") or row.get("tags") or "")
        parser = HTMLText()
        parser.feed(pdp.get("body_html") or "")
        body = parser.text()

        try:
            fmt, size, extra_tags = classify_variant(variant_title, pdp.get("product_type") or "", pdp["title"], handle)
        except ValueError as e:
            rejected.append((handle, variant_title, str(e)))
            continue

        families = families_from_tags(tags, pdp["title"])
        occ = occasions_from_tags(tags)
        if re.search(r"\boffice\b", pdp["title"], re.I) and "office" not in occ:
            occ.append("office")
        if re.search(r"\bdate night\b", pdp["title"], re.I) and "date-night" not in occ:
            occ.append("date-night")
        seasons = seasons_from_tags(tags)
        if re.search(r"\bsummer\b", pdp["title"], re.I) and "summer" not in seasons:
            seasons.append("summer")

        try:
            image_url = variant_image(pdp, pdp_variant)
        except ValueError as e:
            rejected.append((handle, variant_title, str(e)))
            continue
        if not head_ok(image_url):
            rejected.append((handle, variant_title, f"image not reachable {image_url}"))
            continue

        n += 1
        pid = f"scentira-{n:03d}"
        slug = slugify(handle, variant_title)
        top, heart, base = parse_notes(body)
        original = pdp_variant.get("compare_at_price")
        original_price = float(original) if original and float(original) > price else None
        conc = concentration_from_title(pdp["title"])
        gender = gender_from_tags(tags)
        house = house_brand(pdp.get("vendor") or row.get("vendor") or "", fmt)
        name = pdp["title"]
        # Make SKU name explicit about the represented variant
        if fmt != "discovery-set":
            name = f"{pdp['title']} — {size}"

        tags_out = extra_tags[:]
        if "under-1000" in tags or price < 1000:
            tags_out.append("under-1000")

        products.append(
            {
                "id": pid,
                "slug": slug,
                "name": name,
                "houseBrand": house,
                "format": fmt,
                "size": size,
                "price": int(round(price)),
                "originalPrice": int(round(original_price)) if original_price else None,
                "gender": gender,
                "fragranceFamily": families,
                "topNotes": top,
                "heartNotes": heart,
                "baseNotes": base,
                "occasion": occ,
                "season": seasons,
                "tags": tags_out,
                "description": factual_description(body, pdp["title"], size),
                "featured": bool(meta.get("featured")),
                "lineageId": lineage_id(handle, fmt),
                "concentration": conc,
                "handle": handle,
                "variant": variant_title,
                "url": f"https://scentira.in/products/{handle}",
            }
        )
        images[pid] = image_url
        print(f"OK {pid} {name} ₹{int(price)} {fmt} {size}")

    # unique slugs
    seen = {}
    for p in products:
        if p["slug"] in seen:
            p["slug"] = p["slug"] + "-" + p["id"].split("-")[1]
        seen[p["slug"]] = True

    write_ts(products, images)
    print("\nTOTAL", len(products))
    print("REJECTED")
    for r in rejected:
        print(" ", r)


def write_ts(products: list[dict], images: dict[str, str]) -> None:
    lines = [
        "import { Product } from '@/types/product';",
        "import { applyScentiraCanonicalImages } from './scentira-images';",
        "",
        "/**",
        " * Curated Scentira catalogue.",
        " * Every SKU is a verified in-stock variant from scentira.in (Shopify product JSON).",
        " * Prices, sizes, names, and images come from the official listing.",
        " * Qualitative scores are not invented: longevity/intensity use the required",
        " * Product-type default 'moderate' only because those fields are mandatory.",
        " * Notes are included only when the official product copy lists them.",
        " */",
        "",
        "function item(draft: Omit<Product, 'brandSlug' | 'bestFor' | 'similarTo' | 'longevity' | 'intensity'> & Partial<Pick<Product, 'bestFor' | 'similarTo' | 'longevity' | 'intensity'>>): Product {",
        "  return {",
        "    brandSlug: 'scentira',",
        "    bestFor: [],",
        "    similarTo: [],",
        "    longevity: 'moderate',",
        "    intensity: 'moderate',",
        "    ...draft,",
        "  };",
        "}",
        "",
        "export const scentiraProducts: Product[] = applyScentiraCanonicalImages([",
    ]
    for p in products:
        block = [
            "  item({",
            f"    id: {js_str(p['id'])},",
            f"    slug: {js_str(p['slug'])},",
            f"    name: {js_str(p['name'])},",
            f"    houseBrand: {js_str(p['houseBrand'])},",
            f"    format: {js_str(p['format'])},",
            f"    size: {js_str(p['size'])},",
            f"    price: {p['price']},",
        ]
        if p["originalPrice"]:
            block.append(f"    originalPrice: {p['originalPrice']},")
        block += [
            f"    gender: {js_str(p['gender'])},",
            f"    fragranceFamily: {js_arr(p['fragranceFamily'])},",
            f"    topNotes: {js_arr(p['topNotes'])},",
            f"    heartNotes: {js_arr(p['heartNotes'])},",
            f"    baseNotes: {js_arr(p['baseNotes'])},",
            f"    occasion: {js_arr(p['occasion'])},",
            f"    season: {js_arr(p['season'])},",
            f"    tags: {js_arr(p['tags'])},",
            f"    description: {js_str(p['description'])},",
        ]
        if p["featured"]:
            block.append("    featured: true,")
        if p["lineageId"]:
            block.append(f"    lineageId: {js_str(p['lineageId'])},")
        if p["concentration"]:
            block.append(f"    concentration: {js_str(p['concentration'])},")
        block.append("  }),")
        lines.extend(block)
    lines += ["]);", ""]
    OUT_PRODUCTS.write_text("\n".join(lines) + "\n")

    img_lines = [
        "/**",
        " * Canonical Scentira product photography.",
        " * Source of truth: product.id → official Shopify CDN image from the matching",
        " * scentira.in product page. Not catalogue order. Demo approximations are not used.",
        " */",
        "",
        "export const SCENTIRA_PRODUCT_IMAGES: Readonly<Record<string, string>> = {",
    ]
    for pid, url in images.items():
        img_lines.append(f"  {js_str(pid)}: {js_str(url)},")
    img_lines += [
        "};",
        "",
        "export function getScentiraProductImageUrl(productId: string): string | undefined {",
        "  return SCENTIRA_PRODUCT_IMAGES[productId];",
        "}",
        "",
        "export function applyScentiraCanonicalImages<T extends { id: string; imageUrl?: string }>(products: T[]): T[] {",
        "  return products.map((product) => {",
        "    const imageUrl = SCENTIRA_PRODUCT_IMAGES[product.id];",
        "    return imageUrl ? { ...product, imageUrl } : product;",
        "  });",
        "}",
        "",
    ]
    OUT_IMAGES.write_text("\n".join(img_lines))
    print("wrote", OUT_PRODUCTS)
    print("wrote", OUT_IMAGES)


if __name__ == "__main__":
    main()
