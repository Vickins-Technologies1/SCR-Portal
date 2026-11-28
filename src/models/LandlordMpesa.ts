// src/models/LandlordMpesa.ts
import { Schema, model, models } from "mongoose";

const LandlordMpesaSchema = new Schema(
  {
    landlord: { type: Schema.Types.ObjectId, ref: "Landlord", required: true, index: true },
    routingKey: { type: String, default: "default", index: true },
    label: { type: String, default: "" },
    propertyIds: { type: [String], default: [] },
    enabled: { type: Boolean, default: true },
    shortcode: { type: String, default: "" },
    passkey: { type: String, default: "" }, // encrypted (legacy)
    paymentType: { type: String, enum: ["paybill", "till", "bank"], default: "paybill" },
    paybillNumber: { type: String, default: "" },
    paybillAccountNumber: { type: String, default: "" },
    tillNumber: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    bankName: { type: String, default: "" },
    bankBranchRef: { type: String, default: "" },
    bankSettlementMethod: { type: String, default: "EFT" },
    isDefault: { type: Boolean, default: true },
    status: { type: String, enum: ["connected", "pending", "disconnected"], default: "connected" },
    businessName: { type: String, default: "" },
    lastVerifiedAt: { type: Date },
  },
  { timestamps: true }
);

LandlordMpesaSchema.index({ landlord: 1, routingKey: 1 }, { unique: true });
LandlordMpesaSchema.index({ landlord: 1, enabled: 1, isDefault: -1, updatedAt: -1 });

export const LandlordMpesa = models.LandlordMpesa || model("LandlordMpesa", LandlordMpesaSchema);
