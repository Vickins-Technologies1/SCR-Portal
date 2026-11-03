import { Db, ObjectId } from "mongodb";

export type AirbnbPaymentGateway = "daraja";

/** The gateway selected for Airbnb booking collections. */
export type AirbnbPaymentGateway = "tuma" | "daraja";

/** Airbnb collections now use Daraja exclusively. */
export async function getAirbnbOwnerPaymentGateway(
  db: Db,
  ownerId: string
): Promise<AirbnbPaymentGateway> {
  void db;
  void ownerId;
  return "daraja";
}
