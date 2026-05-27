from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.furniture.models.quotation import FurnitureQuotation, FurnitureQuotationPaymentSettings

LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "quotation-logo.png"
FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
FONT_REGULAR = "FurnitureNotoSans"
FONT_BOLD = "FurnitureNotoSans-Bold"
LOGO_WIDTH_MM = 34
_FONTS_REGISTERED = False


def _ensure_pdf_fonts() -> None:
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return

    regular_path = FONT_DIR / "NotoSans-Regular.ttf"
    bold_path = FONT_DIR / "NotoSans-Bold.ttf"
    if not regular_path.exists() or not bold_path.exists():
        msg = "Furniture quotation fonts are missing from app/furniture/assets/fonts"
        raise FileNotFoundError(msg)

    pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(regular_path)))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, str(bold_path)))
    _FONTS_REGISTERED = True


def _format_naira(amount: Decimal | float) -> str:
    value = Decimal(str(amount)).quantize(Decimal("0.01"))
    return f"₦{value:,.2f}"


def _currency_paragraph(amount: Decimal | float, styles: dict, *, bold: bool = False) -> Paragraph:
    style_key = "currencyBold" if bold else "currency"
    return Paragraph(_format_naira(amount), styles[style_key])


def _format_date(value: date | str) -> str:
    if isinstance(value, date):
        return value.strftime("%d %B %Y")
    try:
        dt = datetime.fromisoformat(value)
        return dt.strftime("%d %B %Y")
    except ValueError:
        return str(value)


def _instagram_display(handle: str | None) -> str | None:
    if not handle:
        return None
    cleaned = handle.strip().lstrip("@")
    return f"@{cleaned}" if cleaned else None


def _section_label(text: str, styles: dict) -> Paragraph:
    return Paragraph(text, styles["label"])


def generate_quotation_pdf(
    quotation: FurnitureQuotation,
    payment_settings: FurnitureQuotationPaymentSettings,
) -> bytes:
    _ensure_pdf_fonts()
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Quotation {quotation.quotation_number}",
    )

    base_styles = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "QuoteTitle",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            alignment=TA_CENTER,
            spaceAfter=2,
            textColor=colors.HexColor("#1a1a1a"),
        ),
        "meta": ParagraphStyle(
            "QuoteMeta",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#666666"),
        ),
        "label": ParagraphStyle(
            "SectionLabel",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=10,
            textColor=colors.HexColor("#888888"),
            spaceAfter=4,
            spaceBefore=0,
        ),
        "value": ParagraphStyle(
            "SectionValue",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#333333"),
        ),
        "valueBold": ParagraphStyle(
            "SectionValueBold",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#1a1a1a"),
        ),
        "terms": ParagraphStyle(
            "Terms",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=colors.HexColor("#444444"),
        ),
        "footer": ParagraphStyle(
            "Footer",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#666666"),
        ),
        "currency": ParagraphStyle(
            "Currency",
            parent=base_styles["Normal"],
            fontName=FONT_REGULAR,
            fontSize=9,
            leading=12,
            alignment=TA_RIGHT,
            textColor=colors.HexColor("#333333"),
        ),
        "currencyBold": ParagraphStyle(
            "CurrencyBold",
            parent=base_styles["Normal"],
            fontName=FONT_BOLD,
            fontSize=11,
            leading=14,
            alignment=TA_RIGHT,
            textColor=colors.HexColor("#1a1a1a"),
        ),
        "currencyDiscount": ParagraphStyle(
            "CurrencyDiscount",
            parent=base_styles["Normal"],
            fontName=FONT_REGULAR,
            fontSize=9,
            leading=12,
            alignment=TA_RIGHT,
            textColor=colors.HexColor("#333333"),
        ),
        "groupHeading": ParagraphStyle(
            "GroupHeading",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#1a1a1a"),
            spaceBefore=4,
            spaceAfter=2,
        ),
    }

    story: list = []

    if LOGO_PATH.exists():
        reader = ImageReader(str(LOGO_PATH))
        img_w, img_h = reader.getSize()
        logo_width = LOGO_WIDTH_MM * mm
        logo_height = logo_width * (img_h / float(img_w))
        logo = Image(str(LOGO_PATH), width=logo_width, height=logo_height, mask="auto")
        logo.hAlign = "CENTER"
        story.append(logo)
        story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("QUOTATION", styles["title"]))
    story.append(
        Paragraph(
            f"<b>{quotation.quotation_number}</b><br/>"
            f"Issued {_format_date(quotation.date_issued)}",
            styles["meta"],
        )
    )
    story.append(Spacer(1, 2 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd")))
    story.append(Spacer(1, 7 * mm))

    customer_table = Table(
        [
            [
                Paragraph("CUSTOMER", styles["label"]),
                Paragraph("CONTACT", styles["label"]),
            ],
            [
                Paragraph(
                    f"<b>{quotation.customer_name}</b><br/>"
                    f"{quotation.customer_address or '—'}",
                    styles["value"],
                ),
                Paragraph(
                    f"{quotation.customer_phone}<br/>"
                    f"Date issued: {_format_date(quotation.date_issued)}",
                    styles["value"],
                ),
            ],
        ],
        colWidths=[doc.width / 2] * 2,
    )
    customer_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 0),
            ]
        )
    )
    story.append(customer_table)
    story.append(Spacer(1, 8 * mm))

    item_rows: list[list] = [["Item", "Description", "Qty", "Unit Price", "Line Total"]]
    sections = quotation.sections or []
    if sections:
        for section in sections:
            item_rows.append(
                [
                    Paragraph(section.title.upper(), styles["groupHeading"]),
                    "",
                    "",
                    "",
                    "",
                ]
            )
            for item in section.items:
                item_rows.append(
                    [
                        Paragraph(item.name, styles["valueBold"]),
                        Paragraph(item.description or "—", styles["value"]),
                        str(item.quantity),
                        _currency_paragraph(item.unit_price, styles),
                        _currency_paragraph(item.line_total, styles),
                    ]
                )
    else:
        for item in quotation.items:
            item_rows.append(
                [
                    Paragraph(item.name, styles["valueBold"]),
                    Paragraph(item.description or "—", styles["value"]),
                    str(item.quantity),
                    _currency_paragraph(item.unit_price, styles),
                    _currency_paragraph(item.line_total, styles),
                ]
            )

    col_widths = [36 * mm, 60 * mm, 12 * mm, 28 * mm, 28 * mm]
    items_table = Table(item_rows, colWidths=col_widths, repeatRows=1)
    section_row_indexes = []
    if sections:
        row_index = 1
        for section in sections:
            section_row_indexes.append(row_index)
            row_index += 1 + len(section.items)

    table_style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#666666")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7.5),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, 0), "LEFT"),
        ("ALIGN", (2, 1), (2, -1), "CENTER"),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#dddddd")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for row_index in section_row_indexes:
        table_style_commands.extend(
            [
                ("SPAN", (0, row_index), (-1, row_index)),
                ("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor("#f0f0f0")),
                ("TOPPADDING", (0, row_index), (-1, row_index), 10),
                ("BOTTOMPADDING", (0, row_index), (-1, row_index), 6),
            ]
        )

    items_table.setStyle(TableStyle(table_style_commands))
    story.append(items_table)
    story.append(Spacer(1, 6 * mm))

    totals_data: list[list] = [
        ["Subtotal", _currency_paragraph(quotation.subtotal, styles)],
    ]
    if quotation.discount and quotation.discount > 0:
        totals_data.append(
            [
                "Discount",
                Paragraph(f"-{_format_naira(quotation.discount)}", styles["currencyDiscount"]),
            ]
        )
    if quotation.tax and quotation.tax > 0:
        totals_data.append(["Tax", _currency_paragraph(quotation.tax, styles)])
    totals_data.append(
        ["Grand Total", _currency_paragraph(quotation.grand_total, styles, bold=True)]
    )

    totals_table = Table(totals_data, colWidths=[doc.width - 42 * mm, 42 * mm], hAlign="RIGHT")
    totals_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (0, -1), "RIGHT"),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -2), 9),
                ("FONTSIZE", (0, -1), (-1, -1), 11),
                ("TEXTCOLOR", (0, 0), (0, -2), colors.HexColor("#666666")),
                ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.HexColor("#1a1a1a")),
                ("TOPPADDING", (0, -1), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -2), 4),
            ]
        )
    )
    story.append(totals_table)
    story.append(Spacer(1, 10 * mm))

    has_payment = (
        payment_settings.bank_name
        or payment_settings.account_name
        or payment_settings.account_number
    )
    if has_payment:
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e5e5")))
        story.append(Spacer(1, 5 * mm))
        story.append(_section_label("PAYMENT DETAILS", styles))
        payment_lines = []
        if payment_settings.bank_name:
            payment_lines.append(f"Bank: {payment_settings.bank_name}")
        if payment_settings.account_name:
            payment_lines.append(f"Account Name: {payment_settings.account_name}")
        if payment_settings.account_number:
            payment_lines.append(f"Account Number: {payment_settings.account_number}")
        story.append(Paragraph("<br/>".join(payment_lines), styles["value"]))
        story.append(Spacer(1, 6 * mm))

    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e5e5")))
    story.append(Spacer(1, 5 * mm))
    story.append(_section_label("TERMS &amp; CONDITIONS", styles))
    story.append(Paragraph(payment_settings.terms_text.replace("\n", "<br/>"), styles["terms"]))
    story.append(Spacer(1, 8 * mm))

    has_company = (
        payment_settings.primary_phone
        or payment_settings.secondary_phone
        or payment_settings.instagram_handle
        or payment_settings.company_address
    )
    if has_company:
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e5e5")))
        story.append(Spacer(1, 6 * mm))
        footer_lines = []
        phones = [
            p
            for p in (payment_settings.primary_phone, payment_settings.secondary_phone)
            if p
        ]
        if phones:
            footer_lines.append(" &nbsp;·&nbsp; ".join(phones))
        instagram = _instagram_display(payment_settings.instagram_handle)
        if instagram:
            footer_lines.append(instagram)
        if payment_settings.company_address:
            footer_lines.append(payment_settings.company_address)
        story.append(Paragraph("<br/>".join(footer_lines), styles["footer"]))

    doc.build(story)
    return buffer.getvalue()
