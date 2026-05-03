import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

interface Invoice {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  reference: string;
  createdAt: Date;
  expiresAt: Date;
  description: string;
  items?: Array<{ description: string; qty: number; rate: number }>;
  discount?: number;
  tax?: number;
}

export async function POST(request: NextRequest) {
  try {
    // === AUTH ===
    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;
    const csrf = request.headers.get("X-CSRF-Token");
    const storedCsrf = request.cookies.get("csrf-token")?.value;

    if (!userId || role !== "admin" || csrf !== storedCsrf) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { invoiceId } = await request.json();
    if (!invoiceId || !ObjectId.isValid(invoiceId)) {
      return NextResponse.json({ success: false, message: "Invalid invoice ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const invoice = await db.collection<Invoice>("invoices").findOne({ _id: new ObjectId(invoiceId) });
    if (!invoice) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(invoice.userId) });
    const property = await db.collection("properties").findOne({ _id: new ObjectId(invoice.propertyId) });

    const { pdfBytes, invoiceNumber } = await generateInvoicePdf({
      invoice: {
        reference: invoice.reference,
        amount: invoice.amount,
        description: invoice.description,
        items: invoice.items,
        discount: invoice.discount,
        tax: invoice.tax,
      },
      owner: {
        name: owner?.name,
        email: owner?.email,
        phone: owner?.phone,
      },
      property: { name: property?.name },
      now: new Date(),
      kopokopoTillNumber: process.env.KOPOKOPO_TILL_NUMBER || "",
    });
    return NextResponse.json({
      success: true,
      pdf: Buffer.from(pdfBytes).toString("base64"),
      invoiceNumber,
    });

  } catch (error: any) {
    console.error("PDF Generation Failed:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
