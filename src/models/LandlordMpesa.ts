// src/models/LandlordMpesa.ts
import { Schema, model, models } from "mongoose";

const LandlordMpesaSchema = new Schema(
  {
    landlord: { type: Schema.Types.ObjectId, ref: "Landlord", required: true, unique: true },
    shortcode: { type: String, default: "" },
    passkey: { type: String, default: "" }, // encrypted (legacy)
    tillNumber: { type: String, default: "" },
    accountType: { type: String, enum: ["till", "bank"], default: "till" },
    bankName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
  },
  { timestamps: true }
);

export const LandlordMpesa = models.LandlordMpesa || model("LandlordMpesa", LandlordMpesaSchema);
