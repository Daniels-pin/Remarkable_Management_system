from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import HRFlowable, Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.furniture.models.quotation import FurnitureQuotation, FurnitureQuotationPaymentSettings

LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "quotation-logo.png"
LOGO_WIDTH_MM = 34


def _format_naira(amount: Decimal | float) -> str:
    value = Decimal(str(amount)).quantize(Decimal("0.01"))
    return f"₦{value:,.2f}"


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

    item_rows = [["Item", "Description", "Qty", "Unit Price", "Line Total"]]
    for item in quotation.items:
        item_rows.append(
            [
                Paragraph(item.name, styles["valueBold"]),
                Paragraph(item.description or "—", styles["value"]),
                str(item.quantity),
                _format_naira(item.unit_price),
                _format_naira(item.line_total),
            ]
        )

    col_widths = [36 * mm, 60 * mm, 12 * mm, 28 * mm, 28 * mm]
    items_table = Table(item_rows, colWidths=col_widths, repeatRows=1)
    items_table.setStyle(
        TableStyle(
            [
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
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 6 * mm))

    totals_data = [["Subtotal", _format_naira(quotation.subtotal)]]
    if quotation.discount and quotation.discount > 0:
        totals_data.append(["Discount", f"-{_format_naira(quotation.discount)}"])
    if quotation.tax and quotation.tax > 0:
        totals_data.append(["Tax", _format_naira(quotation.tax)])
    totals_data.append(["Grand Total", _format_naira(quotation.grand_total)])

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
