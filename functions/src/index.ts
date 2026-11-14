
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

import { setGlobalOptions } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();

setGlobalOptions({
  maxInstances: 10,
  region: "us-central1",
});

/**
 * Generate a unique QR token whenever a booking is created.
 */
export const generateBookingQr = onDocumentCreated(
  "bookings/{bookingId}",
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) return;

    const booking = snapshot.data();

    if (booking.qrToken) return;

    const token = randomBytes(32).toString("base64url");

    await snapshot.ref.update({
      qrToken: token,
    });
  },
);

/**
 * Public QR verification endpoint.
 * Returns safe booking details without exposing private user information.
 */
export const verifyBookingQr = onCall(
  async (request) => {
    const token = request.data?.token;

    if (
      typeof token !== "string" ||
      !/^[A-Za-z0-9_-]{40,50}$/.test(token)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid booking QR code.",
      );
    }

    const result = await db
      .collection("bookings")
      .where("qrToken", "==", token)
      .limit(1)
      .get();

    if (result.empty) {
      throw new HttpsError(
        "not-found",
        "This booking QR code was not found.",
      );
    }

    const document = result.docs[0];
    const booking = document.data();

    const isValidEntry =
      booking.status === "Confirmed" &&
      booking.paymentStatus === "Paid";

    return {
      bookingReference: document.id,
      workspaceName: booking.workspaceName ?? "Unknown workspace",
      location: booking.location ?? "Not provided",
      date: booking.date ?? "",
      guests: booking.guests ?? 0,
      total: booking.total ?? 0,
      status: booking.status ?? "Pending",
      paymentStatus: booking.paymentStatus ?? "Unpaid",
      isValidEntry,
    };
  },
);

/**
 * Get or create the secure QR token for a booking.
 * Only the authenticated booking owner can request this.
 */
export const getOrCreateBookingQr = onCall(
  async (request) => {
    const userId = request.auth?.uid;
    const bookingId = request.data?.bookingId;

    if (!userId) {
      throw new HttpsError(
        "unauthenticated",
        "Please sign in to access this booking QR code.",
      );
    }

    if (
      typeof bookingId !== "string" ||
      bookingId.length === 0 ||
      bookingId.length > 150
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid booking reference.",
      );
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const token = randomBytes(32).toString("base64url");

    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(bookingRef);

      if (!snapshot.exists) {
        throw new HttpsError(
          "not-found",
          "Booking not found.",
        );
      }

      const booking = snapshot.data();

      if (booking?.userId !== userId) {
        throw new HttpsError(
          "permission-denied",
          "You do not have access to this booking.",
        );
      }

      if (typeof booking.qrToken === "string" && booking.qrToken) {
        return { token: booking.qrToken };
      }

      transaction.update(bookingRef, {
        qrToken: token,
      });

      return { token };
    });
  },
);

