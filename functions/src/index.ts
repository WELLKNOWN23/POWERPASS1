
import { initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  Timestamp,
  FieldValue,
} from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

import { setGlobalOptions } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();

const db = getFirestore();

setGlobalOptions({
  maxInstances: 10,
  region: "us-central1",
});

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Create a booking securely.
 * The backend controls the booking owner, creation time and expiry.
 */
export const createBookingRequest = onCall(async (request) => {
  const userId = request.auth?.uid;

  if (!userId) {
    throw new HttpsError(
      "unauthenticated",
      "Please sign in before creating a booking."
    );
  }

  const booking = request.data?.booking;
  const memberProfile = request.data?.memberProfile;

  if (!booking || typeof booking !== "object") {
    throw new HttpsError(
      "invalid-argument",
      "Invalid booking details."
    );
  }

  if (
    typeof booking.workspaceId !== "string" ||
    !booking.workspaceId.trim() ||
    typeof booking.workspaceName !== "string" ||
    !booking.workspaceName.trim() ||
    typeof booking.location !== "string" ||
    typeof booking.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(booking.date) ||
    typeof booking.customerName !== "string" ||
    !booking.customerName.trim()
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Some booking details are missing."
    );
  }

  if (
    !Number.isInteger(booking.guests) ||
    booking.guests < 1 ||
    booking.guests > 8
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Guest count must be between 1 and 8."
    );
  }

  if (
    typeof booking.total !== "number" ||
    !Number.isFinite(booking.total) ||
    booking.total <= 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid booking total."
    );
  }

  if (
    !memberProfile ||
    typeof memberProfile.workType !== "string" ||
    memberProfile.workType.trim().length < 2
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Please complete your work profile before booking."
    );
  }

  const bookingRef = db.collection("bookings").doc();

  // Temporary QR token.
  // This will be upgraded to an HMAC-signed token:
  // bookingId.version.signature
  const token = randomBytes(32).toString("base64url");

  const verificationRef = db
    .collection("bookingVerifications")
    .doc(token);

  const expiresAt = Timestamp.fromMillis(
    Date.now() + ONE_HOUR_MS
  );

  const bookingData = {
    userId,
    customerName: booking.customerName.trim(),
    workspaceId: booking.workspaceId.trim(),
    workspaceName: booking.workspaceName.trim(),
    location: booking.location.trim(),
    date: booking.date,
    guests: booking.guests,
    total: booking.total,

    status: "Pending",
    paymentStatus: "Unpaid",
    paymentReference: null,

    qrToken: token,
    version: 1,

    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  };

  const verificationData = {
    bookingReference: bookingRef.id,
    workspaceName: booking.workspaceName.trim(),
    location: booking.location.trim(),
    date: booking.date,
    guests: booking.guests,
    total: booking.total,

    status: "Pending",
    paymentStatus: "Unpaid",

    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
  };

  // Save the booking and its verification record atomically.
  await db.runTransaction(async (transaction) => {
    transaction.set(bookingRef, bookingData);
    transaction.set(verificationRef, verificationData);
  });

  return {
    bookingId: bookingRef.id,
    expiresAt: expiresAt.toMillis(),
  };
});

/**
 * Generate a QR token for older bookings
 * that do not already have one.
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
  }
);

/**
 * Verify a booking QR code.
 * Expired bookings cannot be used for entry.
 */
export const verifyBookingQr = onCall(async (request) => {
  const token = request.data?.token;

  if (
    typeof token !== "string" ||
    !/^[A-Za-z0-9_-]{40,50}$/.test(token)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid booking QR code."
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
      "This booking QR code was not found."
    );
  }

  const document = result.docs[0];
  const booking = document.data();

  const expired =
    booking.expiresAt instanceof Timestamp &&
    booking.expiresAt.toMillis() <= Date.now();

  const isValidEntry =
    !expired &&
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
    expiresAt: booking.expiresAt?.toMillis?.() ?? null,
    expired,
    isValidEntry,
  };
});

/**
 * Get or create the QR token for the authenticated booking owner.
 */
export const getOrCreateBookingQr = onCall(async (request) => {
  const userId = request.auth?.uid;
  const bookingId = request.data?.bookingId;

  if (!userId) {
    throw new HttpsError(
      "unauthenticated",
      "Please sign in to access this booking QR code."
    );
  }

  if (
    typeof bookingId !== "string" ||
    bookingId.length === 0 ||
    bookingId.length > 150
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid booking reference."
    );
  }

  const bookingRef = db
    .collection("bookings")
    .doc(bookingId);

  const token = randomBytes(32).toString("base64url");

  return await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(bookingRef);

    if (!snapshot.exists) {
      throw new HttpsError(
        "not-found",
        "Booking not found."
      );
    }

    const booking = snapshot.data();

    if (booking?.userId !== userId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this booking."
      );
    }

    if (
      typeof booking.qrToken === "string" &&
      booking.qrToken
    ) {
      return { token: booking.qrToken };
    }

    transaction.update(bookingRef, {
      qrToken: token,
    });

    return { token };
  });
});

/**
 * Automatically cancel unpaid bookings after their one-hour expiry.
 * Runs every five minutes.
 */
export const expireUnpaidBookings = onSchedule(
  "every 5 minutes",
  async () => {
    const now = Timestamp.now();

    const expiredBookings = await db
      .collection("bookings")
      .where("expiresAt", "<=", now)
      .limit(200)
      .get();

    if (expiredBookings.empty) {
      console.log("No expired bookings found.");
      return;
    }

    const batch = db.batch();
    let cancelledCount = 0;

    for (const bookingDoc of expiredBookings.docs) {
      const booking = bookingDoc.data();

      // Never cancel a paid or already processed booking.
      if (
        booking.status !== "Pending" ||
        booking.paymentStatus !== "Unpaid"
      ) {
        continue;
      }

      batch.update(bookingDoc.ref, {
        status: "Cancelled",
        expiredAt: FieldValue.serverTimestamp(),
      });

      if (typeof booking.qrToken === "string") {
        const verificationRef = db
          .collection("bookingVerifications")
          .doc(booking.qrToken);

        const verificationSnapshot =
          await verificationRef.get();

        if (verificationSnapshot.exists) {
          batch.update(verificationRef, {
            status: "Cancelled",
            expiredAt: FieldValue.serverTimestamp(),
          });
        }
      }

      cancelledCount++;
    }

    if (cancelledCount > 0) {
      await batch.commit();
    }

    console.log(
      `Automatically cancelled ${cancelledCount} expired bookings.`
    );
  }
);
/**
 * Demo payment only.
 * No real money is collected.
 * Only the booking owner can confirm payment, and only before expiry.
 */
export const simulateDemoPayment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in first.");
  }

  const bookingId = request.data?.bookingId;

  if (typeof bookingId !== "string" || !bookingId.trim()) {
    throw new HttpsError("invalid-argument", "A valid booking ID is required.");
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  const paymentReference =
    `DEMO-${randomBytes(8).toString("hex").toUpperCase()}`;

  return db.runTransaction(async (transaction) => {
    const bookingSnapshot = await transaction.get(bookingRef);

    if (!bookingSnapshot.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }

    const booking = bookingSnapshot.data()!;

    if (booking.userId !== request.auth!.uid) {
      throw new HttpsError(
        "permission-denied",
        "You cannot pay for another user's booking."
      );
    }

    if (
      booking.status !== "Pending" ||
      booking.paymentStatus !== "Unpaid"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This booking is no longer awaiting payment."
      );
    }

    if (
      !(booking.expiresAt instanceof Timestamp) ||
      booking.expiresAt.toMillis() <= Date.now()
    ) {
      throw new HttpsError(
        "deadline-exceeded",
        "This booking has expired. Please create a new booking."
      );
    }

    const verificationRef =
      typeof booking.qrToken === "string"
        ? db.collection("bookingVerifications").doc(booking.qrToken)
        : null;

    // Read the verification document before performing any writes.
    const verificationSnapshot = verificationRef
      ? await transaction.get(verificationRef)
      : null;

    if (
      verificationSnapshot?.exists &&
      verificationSnapshot.data()?.bookingReference !== bookingId
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Booking verification record does not match."
      );
    }

    transaction.update(bookingRef, {
      status: "Confirmed",
      paymentStatus: "Paid",
      paymentReference,
      paidAt: FieldValue.serverTimestamp(),
    });

    if (verificationRef && verificationSnapshot?.exists) {
      transaction.update(verificationRef, {
        status: "Confirmed",
        paymentStatus: "Paid",
        paymentReference,
        paidAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      success: true,
      bookingId,
      status: "Confirmed",
      paymentStatus: "Paid",
      paymentReference,
    };
  });
});