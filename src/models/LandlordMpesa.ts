// src/models/LandlordMpesa.ts
import { Schema, model, models } from "mongoose";

const LandlordMpesaSchema = new Schema(
  {
    landlord: { type: Schema.Types.ObjectId, ref: "Landlord", required: true, unique: true },
    shortcode: { type: String, required: true },
    passkey: { type: String, required: true }, // encrypted
  },
  { timestamps: true }
);

export const LandlordMpesa = models.LandlordMpesa || model("LandlordMpesa", LandlordMpesaSchema);
