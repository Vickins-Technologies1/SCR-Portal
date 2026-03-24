// src/models/LandlordMpesa.ts
import { Schema, model, models } from "mongoose";

const LandlordMpesaSchema = new Schema(
  {
    landlord: { type: Schema.Types.ObjectId, ref: "Landlord", required: true, unique: true },
    shortcode: { type: String, default: "" },
    passkey: { type: String, default: "" }, // encrypted (legacy)
    paymentType: { type: String, enum: ["paybill", "till", "bank"], default: "paybill" },
    paybillNumber: { type: String, default: "" },
    paybillAccountNumber: { type: String, default: "" },
    tillNumber: { type: String, default: "" },
    bankPaybillNumber: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    isDefault: { type: Boolean, default: true },
    kopokopoRecipientType: { type: String, default: "" },
    kopokopoRecipientUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

export const LandlordMpesa = models.LandlordMpesa || model("LandlordMpesa", LandlordMpesaSchema);
