import { describe, expect, it } from "vitest";
import { mapAirbnbListing, mapAirbnbReservation, mapAirbnbConversation } from "./airbnb-sync";

describe("airbnb sync mapping", () => {
  it("maps listing payloads into internal schema", () => {
    const listing = mapAirbnbListing(
      {
        id: "lst-100",
        title: "Ocean View Suite",
        city: "Mombasa",
        status: "active",
        base_rate: 9200,
        weekend_rate: 11000,
        occupancy_rate: 82,
        rating: 4.9,
        review_count: 120,
        amenities: ["Wi-Fi", "Pool"],
        house_rules: ["No parties"],
      },
      "owner-1"
    );

    expect(listing.ownerId).toBe("owner-1");
    expect(listing.externalId).toBe("lst-100");
    expect(listing.name).toBe("Ocean View Suite");
    expect(listing.location).toBe("Mombasa");
    expect(listing.status).toBe("published");
    expect(listing.baseRate).toBe(9200);
    expect(listing.weekendRate).toBe(11000);
    expect(listing.amenities).toContain("Wi-Fi");
  });

  it("maps reservation payloads into booking records", () => {
    const booking = mapAirbnbReservation(
      {
        reservation_id: "res-44",
        listing_id: "lst-100",
        listing_name: "Ocean View Suite",
        guest: { name: "Linet Achieng", email: "linet@example.com" },
        check_in: "2026-04-08",
        check_out: "2026-04-12",
        total_price: 42000,
        status: "confirmed",
        payout_status: "paid",
      },
      "owner-1",
      "lst-100",
      "Ocean View Suite"
    );

    expect(booking.externalId).toBe("res-44");
    expect(booking.guestName).toBe("Linet Achieng");
    expect(booking.nights).toBe(4);
    expect(booking.total).toBe(42000);
    expect(booking.status).toBe("confirmed");
    expect(booking.payoutStatus).toBe("paid");
  });

  it("normalizes booking statuses and direct sources", () => {
    const booking = mapAirbnbReservation(
      {
        id: "res-99",
        listing_id: "lst-200",
        listing_name: "Nairobi Loft",
        guest: { name: "Kelvin Otieno" },
        start_date: "2026-04-01",
        end_date: "2026-04-03",
        total: "16000",
        status: "altered",
        channel: "Direct",
        payout_status: "pending",
      },
      "owner-2",
      "lst-200",
      "Nairobi Loft"
    );

    expect(booking.status).toBe("modified");
    expect(booking.source).toBe("Direct");
    expect(booking.total).toBe(16000);
  });

  it("maps conversations and tracks unread counts", () => {
    const convo = mapAirbnbConversation(
      {
        conversation_id: "msg-7",
        listing_id: "lst-100",
        listing_name: "Ocean View Suite",
        guest_name: "Abdi Noor",
        last_message: "Can I check in early?",
        unread_count: 2,
      },
      "owner-1",
      "lst-100",
      "Ocean View Suite"
    );

    expect(convo.externalId).toBe("msg-7");
    expect(convo.guestName).toBe("Abdi Noor");
    expect(convo.unread).toBe(2);
  });
});
