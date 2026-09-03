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

from app.furniture.models.invoice import FurnitureInvoice
from app.furniture.models.quotation import FurnitureQuotationPaymentSettings
from app.furniture.services.invoice_service import _payment_total, _resolve_display_status

LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "quotation-logo.png"
FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
FONT_REGULAR = "FurnitureNotoSans"
FONT_BOLD = "FurnitureNotoSans-Bold"
LOGO_WIDTH_MM = 34
_FONTS_REGISTERED = False

STATUS_COLORS = {
    "draft": colors.HexColor("#888888"),
    "sent": colors.HexColor("#2563eb"),
    "partially_paid": colors.HexColor("#d97706"),
    "paid": colors.HexColor("#16a34a"),
    "overdue": colors.HexColor("#dc2626"),
    "voided": colors.HexColor("#888888"),
    "cancelled": colors.HexColor("#888888"),
    "completed": colors.HexColor("#16a34a"),
}


def _ensure_pdf_fonts() -> None:
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    regular_path = FONT_DIR / "NotoSans-Regular.ttf"
    bold_path = FONT_DIR / "NotoSans-Bold.ttf"
    if not regular_path.exists() or not bold_path.exists():
        msg = "Furniture fonts are missing from app/furniture/assets/fonts"
        raise FileNotFoundError(msg)
    pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(regular_path)))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, str(bold_path)))
    _FONTS_REGISTERED = True


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


def generate_invoice_pdf(
    invoice: FurnitureInvoice,
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
        title=f"Invoice {invoice.invoice_number}",
    )

    base_styles = getSampleStyleSheet()
    styles = {
        "company": ParagraphStyle(
            "Company",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#1a1a1a"),
            spaceAfter=2,
        ),
        "title": ParagraphStyle(
            "InvoiceTitle",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            alignment=TA_CENTER,
            spaceAfter=4,
            textColor=colors.HexColor("#1a1a1a"),
        ),
        "meta": ParagraphStyle(
            "InvoiceMeta",
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
            fontSize=12,
            leading=15,
            alignment=TA_RIGHT,
            textColor=colors.HexColor("#1a1a1a"),
        ),
        "currencyGreen": ParagraphStyle(
            "CurrencyGreen",
            parent=base_styles["Normal"],
            fontName=FONT_BOLD,
            fontSize=9,
            leading=12,
            alignment=TA_RIGHT,
            textColor=colors.HexColor("#16a34a"),
        ),
        "currencyRed": ParagraphStyle(
            "CurrencyRed",
            parent=base_styles["Normal"],
            fontName=FONT_BOLD,
            fontSize=9,
            leading=12,
            alignment=TA_RIGHT,
            textColor=colors.HexColor("#dc2626"),
        ),
        "status": ParagraphStyle(
            "Status",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            alignment=TA_CENTER,
            textColor=colors.white,
        ),
    }

    amount_paid = _payment_total(invoice)
    balance_due = max(Decimal("0"), invoice.grand_total - amount_paid)
    display_status = _resolve_display_status(invoice, balance_due).value.replace("_", " ").upper()
    status_color = STATUS_COLORS.get(
        _resolve_display_status(invoice, balance_due).value, colors.HexColor("#888888")
    )

    story: list = []

    if LOGO_PATH.exists():
        reader = ImageReader(str(LOGO_PATH))
        img_w, img_h = reader.getSize()
        logo_width = LOGO_WIDTH_MM * mm
        logo_height = logo_width * (img_h / float(img_w))
        logo = Image(str(LOGO_PATH), width=logo_width, height=logo_height, mask="auto")
        logo.hAlign = "CENTER"
        story.append(logo)
        story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("REMARKABLE FURNITURE", styles["company"]))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("INVOICE", styles["title"]))
    story.append(
        Paragraph(
            f"<b>{invoice.invoice_number}</b><br/>Issue Date: {_format_date(invoice.date_issued)}",
            styles["meta"],
        )
    )
    story.append(Spacer(1, 2 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd")))
    story.append(Spacer(1, 7 * mm))

    invoice_info_lines = [
        f"Due Date: {_format_date(invoice.due_date)}",
    ]
    if invoice.source_quotation_number:
        invoice_info_lines.append(f"Quote: {invoice.source_quotation_number}")
    if invoice.source_order_number:
        invoice_info_lines.append(f"Order: {invoice.source_order_number}")
    if invoice.sales_representative:
        invoice_info_lines.append(f"Sales Rep: {invoice.sales_representative}")

    status_cell = Table(
        [[Paragraph(display_status, styles["status"])]],
        colWidths=[38 * mm],
    )
    status_cell.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), status_color),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    header_table = Table(
        [
            [
                Paragraph("CUSTOMER INFORMATION", styles["label"]),
                Paragraph("INVOICE INFORMATION", styles["label"]),
                Paragraph("STATUS", styles["label"]),
            ],
            [
                Paragraph(
                    f"<b>{invoice.customer_name}</b><br/>"
                    f"{invoice.customer_address or '—'}<br/>"
                    f"{invoice.customer_phone}"
                    + (f"<br/>{invoice.customer_email}" if invoice.customer_email else ""),
                    styles["value"],
                ),
                Paragraph("<br/>".join(invoice_info_lines), styles["value"]),
                status_cell,
            ],
        ],
        colWidths=[doc.width * 0.38, doc.width * 0.38, doc.width * 0.24],
    )
    header_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
            ]
        )
    )
    story.append(header_table)
    story.append(Spacer(1, 8 * mm))

    item_rows: list[list] = [["Item", "Description", "Qty", "Unit Price", "Line Total"]]
    for item in invoice.items:
        item_rows.append(
            [
                Paragraph(item.name, styles["valueBold"]),
                Paragraph(item.description or "—", styles["value"]),
                str(item.quantity),
                Paragraph(_format_naira(item.unit_price), styles["currency"]),
                Paragraph(_format_naira(item.line_total), styles["currency"]),
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

    totals_data: list[list] = [
        ["Subtotal", Paragraph(_format_naira(invoice.subtotal), styles["currency"])],
    ]
    if invoice.discount > 0:
        totals_data.append(
            ["Discount", Paragraph(f"-{_format_naira(invoice.discount)}", styles["currency"])]
        )
    if invoice.additional_charges > 0:
        totals_data.append(
            [
                "Additional Charges",
                Paragraph(_format_naira(invoice.additional_charges), styles["currency"]),
            ]
        )
    if invoice.tax > 0:
        totals_data.append(["Tax", Paragraph(_format_naira(invoice.tax), styles["currency"])])
    totals_data.append(
        ["Grand Total", Paragraph(_format_naira(invoice.grand_total), styles["currencyBold"])]
    )
    if amount_paid > 0:
        totals_data.append(
            ["Advance Payment", Paragraph(_format_naira(amount_paid), styles["currencyGreen"])]
        )
    balance_style = styles["currencyRed"] if balance_due > 0 else styles["currencyBold"]
    totals_data.append(
        ["Balance Due", Paragraph(_format_naira(balance_due), balance_style)]
    )

    totals_table = Table(totals_data, colWidths=[42 * mm, 38 * mm])
    totals_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (0, -1), "RIGHT"),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -2), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LINEABOVE", (0, -2), (-1, -2), 1, colors.HexColor("#1a1a1a")),
            ]
        )
    )
    wrapper = Table([[None, totals_table]], colWidths=[doc.width - 80 * mm, 80 * mm])
    wrapper.setStyle(TableStyle([("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    story.append(wrapper)
    story.append(Spacer(1, 8 * mm))

    if invoice.payments:
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd")))
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph("PAYMENT HISTORY", styles["label"]))
        story.append(Spacer(1, 3 * mm))
        pay_rows = [["Date", "Description", "Method", "Reference", "Amount"]]
        for p in invoice.payments:
            pay_rows.append(
                [
                    _format_date(p.payment_date),
                    p.description,
                    p.method,
                    p.reference or "—",
                    Paragraph(_format_naira(p.amount), styles["currency"]),
                ]
            )
        pay_table = Table(pay_rows, colWidths=[28 * mm, 32 * mm, 24 * mm, 32 * mm, 28 * mm])
        pay_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f5")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#dddddd")),
                    ("ALIGN", (4, 1), (4, -1), "RIGHT"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(pay_table)
        story.append(Spacer(1, 8 * mm))

    has_payment = (
        payment_settings.bank_name
        or payment_settings.account_name
        or payment_settings.account_number
    )
    if has_payment:
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd")))
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph("PAYMENT DETAILS", styles["label"]))
        lines = []
        if payment_settings.bank_name:
            lines.append(f"Bank: {payment_settings.bank_name}")
        if payment_settings.account_name:
            lines.append(f"Account Name: {payment_settings.account_name}")
        if payment_settings.account_number:
            lines.append(f"Account Number: {payment_settings.account_number}")
        story.append(Paragraph("<br/>".join(lines), styles["value"]))
        story.append(Spacer(1, 6 * mm))

    terms = invoice.payment_terms or payment_settings.terms_text
    if terms:
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd")))
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph("TERMS &amp; CONDITIONS", styles["label"]))
        story.append(Paragraph(terms.replace("\n", "<br/>"), styles["terms"]))
        story.append(Spacer(1, 6 * mm))

    instagram = _instagram_display(payment_settings.instagram_handle)
    footer_parts = []
    if payment_settings.primary_phone:
        footer_parts.append(payment_settings.primary_phone)
    if payment_settings.secondary_phone:
        footer_parts.append(payment_settings.secondary_phone)
    if instagram:
        footer_parts.append(instagram)
    if payment_settings.company_address:
        footer_parts.append(payment_settings.company_address)
    if footer_parts:
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd")))
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph(" &nbsp;|&nbsp; ".join(footer_parts), styles["footer"]))

    doc.build(story)
    return buffer.getvalue()
