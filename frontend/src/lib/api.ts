import axios from "axios";
import { clearAdminSession, clearCaregiverSession, clearSharedSession, readSessionValue } from "@/lib/session";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://apnacare-backend-2p21.onrender.com";
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || API_BASE_URL.replace(/^http/i, "ws");

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof FormData !== "undefined" && config.data instanceof FormData && config.headers) {
    delete (config.headers as Record<string, string | undefined>)["Content-Type"];
    delete (config.headers as Record<string, string | undefined>)["content-type"];
  }

  const existingAuthorization =
    (config.headers as Record<string, string | undefined> | undefined)?.Authorization ??
    (config.headers as Record<string, string | undefined> | undefined)?.authorization;

  if (existingAuthorization) {
    return config;
  }

  const requestUrl = `${config.baseURL ?? ""}${config.url ?? ""}`;
  const isAdminRequest = /\/admin(\/|$)/.test(requestUrl);
  const isCaregiverRequest = /\/caregiver(\/|$)|\/booking\/verify-otp(\/|$)|\/booking\/face-verify(\/|$)|\/booking\/latest(\/|$)/.test(requestUrl);
  const token = isAdminRequest ? getAdminToken() : isCaregiverRequest ? getCaregiverToken() : getUserToken();

  if (!token) {
    return config;
  }

  config.headers = {
    ...config.headers,
    Authorization: `Bearer ${token}`,
  };
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = `${error?.config?.baseURL ?? ""}${error?.config?.url ?? ""}`;
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

    if (status === 401) {
      if (/\/admin(\/|$)/.test(requestUrl)) {
        clearAdminSession();
        if (/^\/admin(\/|$)/.test(currentPath) && currentPath !== "/admin/login") {
          window.location.replace("/admin/login");
        }
      } else if (/\/caregiver(\/|$)|\/booking\/verify-otp(\/|$)|\/booking\/face-verify(\/|$)|\/booking\/latest(\/|$)/.test(requestUrl)) {
        clearCaregiverSession();
        if (/^\/caregiver(\/|$)/.test(currentPath) && currentPath !== "/caregiver/login") {
          window.location.replace("/caregiver/login");
        }
      } else {
        clearSharedSession();
        if (!/^\/(login|signup|forgot-password|reset-password)/.test(currentPath)) {
          window.location.replace("/login");
        }
      }
    }

    return Promise.reject(error);
  }
);

const getUserToken = () => readSessionValue("apnacare_token");
const getAdminToken = () => readSessionValue("apnacare_admin_token");
const getCaregiverToken = () => readSessionValue("apnacare_caregiver_token");
const withBearer = (token: string | null) => (token ? { Authorization: `Bearer ${token}` } : {});

export interface BookingReview {
  id: number;
  rating: number;
  comment: string;
  created_at?: string | null;
}

export interface BookingTask {
  id: number;
  name: string;
  completed: boolean;
  status: string;
  completed_at?: string | null;
}

export interface CareTaskOption {
  value: string;
  label: string;
}

export type CareOptionsResponse = Record<string, CareTaskOption[]>;

export interface PublicCaregiverProfile {
  id: number;
  full_name: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gender?: string | null;
  experience?: number | null;
  skills: string[];
  rating?: number | null;
  is_verified: boolean;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number | null;
  documents: CaregiverDocumentSummary[];
}

export interface BookingSummary {
  id: number;
  user_id: number;
  caregiver_id: number;
  patient_id: number;
  patient_name?: string | null;
  patient_age?: number | null;
  patient_condition?: string | null;
  care_type?: string | null;
  selected_care_tasks?: string[] | null;
  custom_care_details?: string | null;
  preferred_gender?: string | null;
  user_address?: string | null;
  user_latitude?: number | null;
  user_longitude?: number | null;
  search_radius_km?: number | null;
  assigned_distance_km?: number | null;
  assignment_reason?: string | null;
  service_type?: string | null;
  notes?: string | null;
  duration_type?: string | null;
  hours?: number | null;
  days?: number | null;
  months?: number | null;
  status: string;
  payment_method?: "online" | "cash_on_delivery" | null;
  otp?: string | null;
  otp_verified?: boolean;
  face_verified?: boolean;
  face_verification_status?: string | null;
  manual_override?: boolean;
  arrival_selfie_id?: number | null;
  qr_code_path?: string | null;
  payment_status?: string | null;
  payment_collected_method?: string | null;
  amount?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  prescription_file_name?: string | null;
  has_prescription?: boolean;
  tasks?: BookingTask[];
  caregiver?: PublicCaregiverProfile | null;
  has_review?: boolean;
  review?: BookingReview | null;
}

export interface CaregiverProfileSummary {
  id: number;
  user_id: number;
  full_name: string | null;
  phone: string | null;
  email?: string | null;
  location: string | null;
  address?: string | null;
  gender?: "male" | "female" | "other" | null;
  skills: string[];
  experience: number | null;
  status: "pending" | "approved" | "rejected";
  is_available: boolean;
  is_enabled?: boolean;
  forced_offline?: boolean;
  is_verified: boolean;
  document_name?: string | null;
  document_uploaded: boolean;
  documents?: CaregiverDocumentSummary[];
  rating?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CaregiverDocumentSummary {
  id: number;
  document_type: "profile" | "id" | "certificate" | string;
  file_name: string;
  content_type?: string | null;
  uploaded_at?: string | null;
}

export interface UserProfile {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: "user";
  location?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
}

export interface CaregiverProfile {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: "caregiver";
  location?: string | null;
  address?: string | null;
  gender?: "male" | "female" | "other" | string | null;
  skills: string[];
  experience?: number | null;
  rating?: number | null;
  is_available: boolean;
  status: string;
  is_verified: boolean;
  latitude?: number | null;
  longitude?: number | null;
  documents: CaregiverDocumentSummary[];
}

export type ProfileUpdatePayload = {
  name?: string;
  phone?: string;
  location?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  gender?: string;
  skills?: string[];
  experience?: number | null;
};

export interface AdminMetricOverview {
  total_bookings: number;
  active_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  active_users: number;
  active_caregivers: number;
  pending_caregivers: number;
  revenue: number;
  platform_fees: number;
}

export interface AdminBookingPerson {
  id: number | null;
  name: string | null;
  age?: number | null;
  email?: string | null;
  phone?: string | null;
}

export interface AdminBookingCaregiver extends AdminBookingPerson {
  address?: string | null;
  gender?: string | null;
  status?: string | null;
  is_available?: boolean | null;
  is_enabled?: boolean | null;
  forced_offline?: boolean | null;
  rating?: number | null;
  latest_location?: { lat: number; lng: number } | null;
}

export interface AdminBookingRecord {
  id: number;
  status: string;
  payment_status: string;
  amount: number;
  service_type?: string | null;
  notes?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  preferred_gender?: string | null;
  assigned_distance_km?: number | null;
  assignment_reason?: string | null;
  patient: AdminBookingPerson;
  caregiver: AdminBookingCaregiver;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  admin_notes?: string | null;
  reassigned_from_caregiver_id?: number | null;
  live_location?: { lat: number; lng: number; timestamp?: string | null } | null;
  otp_verified?: boolean;
  face_verified?: boolean;
  face_verification_status?: string | null;
  manual_override?: boolean;
  arrival_selfie_id?: number | null;
}

export interface BookingOtpVerificationResponse {
  message: string;
  booking_id: number;
  otp_verified: boolean;
  next_step: string;
  face_verification_status?: string | null;
}

export interface FaceVerificationResponse {
  verified: boolean;
  face_verification_status: string;
  distance?: number | null;
  threshold?: number | null;
  message: string;
}

export interface AdminFaceReviewRecord {
  booking_id: number;
  caregiver_id: number | null;
  otp_verified: boolean;
  face_verified: boolean;
  face_verification_status: string;
  profile_photo_document_id?: number | null;
  arrival_selfie_document_id?: number | null;
}

export interface AdminCaregiverStats {
  jobs_completed: number;
  active_jobs: number;
  average_rating: number;
  review_count: number;
}

export interface AdminCaregiverRecord extends CaregiverProfileSummary {
  stats?: AdminCaregiverStats;
}

export interface AdminPaymentTransaction {
  id: number;
  booking_id: number;
  caregiver_id: number | null;
  gross_amount: number;
  caregiver_amount: number;
  platform_fee: number;
  status: string;
  paid_at?: string | null;
}

export interface AdminCaregiverEarning {
  caregiver_id: number;
  caregiver_name: string | null;
  email?: string | null;
  earnings: number;
}

export interface AdminPaymentSummary {
  total_revenue: number;
  paid_transactions: number;
  pending_transactions: number;
  platform_commission: number;
}

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at?: string | null;
}

export interface PaymentOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  booking_id: number;
  key: string;
}

export interface PaymentVerificationResponse {
  message: string;
  booking_id: number;
  status: string;
  booking_status?: string;
  caregiver?: {
    id?: number | null;
    name?: string | null;
    phone?: string | null;
    gender?: string | null;
    skills?: string[];
    experience?: number | null;
    rating?: number | null;
    distance_km?: number | null;
    is_verified?: boolean;
  } | null;
  caregiver_amount?: number;
  platform_fee?: number;
  assignment_reason?: string | null;
}

export interface PaymentStatusResponse {
  booking_id: number;
  payment_method?: string | null;
  payment_status: string;
  payment_collected_method?: string | null;
  amount?: number | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
}

export interface CaregiverHistoryItem {
  id: number;
  patient_name?: string | null;
  patient_age?: number | null;
  status: string;
  payment_status: string;
  service_type?: string | null;
  duration_type?: string | null;
  hours?: number | null;
  days?: number | null;
  months?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  amount: number;
  earning: number;
}

export interface CaregiverEarningsSummary {
  today_earnings: number;
  total_earnings: number;
  jobs_paid: number;
  pending_payouts: number;
}

export interface CaregiverPerformanceSummary {
  jobs_completed: number;
  average_rating: number;
  review_count: number;
  approval_status: string;
  is_verified: boolean;
}

export interface CaregiverReviewItem {
  id: number;
  booking_id: number;
  rating: number;
  comment?: string | null;
  created_at?: string | null;
  patient_name?: string | null;
}

export interface AdminReviewRecord {
  id: number;
  booking_id: number;
  rating: number;
  comment: string;
  created_at?: string | null;
  patient_name?: string | null;
  caregiver_name?: string | null;
}

export const authAPI = {
  signup: (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role?: "user" | "caregiver";
    location?: string;
    address?: string;
    gender?: "male" | "female" | "other";
    latitude?: number;
    longitude?: number;
    skills?: string[];
    experience?: number;
    profile_photo?: { file_name: string; content_type?: string; file_data: string };
    id_proof?: { file_name: string; content_type?: string; file_data: string };
    certificate?: { file_name: string; content_type?: string; file_data: string };
  }) => api.post("/auth/signup", data),
  login: (payload: { email: string; password: string; expected_role?: "user" | "caregiver" | "admin" }) =>
    api.post("/auth/login", payload),
  forgotPassword: (payload: { email: string; role: "user" | "caregiver" }) =>
    api.post<{ message: string }>("/auth/forgot-password", payload),
  resetPassword: (payload: { token: string; new_password: string }) =>
    api.post<{ message: string }>("/auth/reset-password", payload),
};

export const bookingAPI = {
  create: async (data: {
    patient_name: string;
    age: number;
    date: string;
    time: string;
    service_type?: string;
    notes?: string;
    care_type?: string;
    selected_care_tasks?: string[];
    custom_care_details?: string;
    patient_condition?: string;
    preferred_gender?: "any" | "male" | "female";
    user_address?: string;
    user_latitude?: number;
    user_longitude?: number;
    search_radius_km?: number;
    duration_type?: string;
    hours?: number;
    days?: number;
    months?: number;
    payment_method?: "online" | "cash_on_delivery";
    prescription?: {
      file_name: string;
      content_type?: string;
      file_data: string;
    };
  }) => {
    const headers = withBearer(getUserToken());

    try {
      return await api.post("/booking/create", data, { headers });
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return api.post("/booking", data, { headers });
      }
      throw error;
    }
  },
  getCareOptions: () => api.get<CareOptionsResponse>("/booking/care-options"),
  getLatest: () => api.get<{ booking: BookingSummary | null }>("/booking/latest", { headers: withBearer(getCaregiverToken()) }),
  getMine: () => api.get<{ bookings: BookingSummary[] }>("/booking/mine", { headers: withBearer(getUserToken()) }),
  verifyOtp: (payload: { booking_id: number; entered_otp: string }) =>
    api.post<BookingOtpVerificationResponse>("/booking/verify-otp", payload, {
      headers: withBearer(getCaregiverToken()),
    }),
  verifyFace: (bookingId: number, selfieFile: File) => {
    const formData = new FormData();
    formData.append("selfie", selfieFile);
    return api.post<FaceVerificationResponse>(`/booking/face-verify/${bookingId}`, formData, {
      headers: withBearer(getCaregiverToken()),
    });
  },
  downloadPrescription: (bookingId: number, role: "user" | "caregiver" | "admin" = "user") => {
    const token = role === "admin" ? getAdminToken() : role === "caregiver" ? getCaregiverToken() : getUserToken();
    return api.get<Blob>(`/booking/${bookingId}/prescription`, {
      headers: withBearer(token),
      responseType: "blob",
    });
  },
  submitReview: (payload: { booking_id: number; rating: number; comment: string }) =>
    api.post<{ message: string; review: BookingReview }>("/booking/review", payload, { headers: withBearer(getUserToken()) }),
};

export const trackingAPI = {
  getETA: (bookingId: string) => api.get(`/tracking/eta?booking_id=${bookingId}`, { headers: withBearer(getUserToken()) }),
  getDetails: (bookingId: string) =>
    api.get<{
        booking: {
          id: number;
          caregiver_id?: number | null;
          status: string;
        payment_method?: string | null;
        payment_status?: string | null;
        payment_collected_method?: string | null;
        otp?: string | null;
        otp_verified?: boolean;
        face_verified?: boolean;
        face_verification_status?: string | null;
        manual_override?: boolean;
        qr_code_path?: string | null;
        service_type?: string | null;
        care_type?: string | null;
        selected_care_tasks?: string[] | null;
        custom_care_details?: string | null;
        notes?: string | null;
        preferred_gender?: string | null;
        user_address?: string | null;
        user_latitude?: number | null;
        user_longitude?: number | null;
        search_radius_km?: number | null;
        assigned_distance_km?: number | null;
        assignment_reason?: string | null;
        patient_name?: string | null;
        patient_age?: number | null;
        start_time?: string | null;
        end_time?: string | null;
        amount?: number | null;
        tasks?: BookingTask[];
        has_review?: boolean;
        review?: BookingReview | null;
        caregiver?: PublicCaregiverProfile | null;
      };
      latest_location?: { lat: number; lng: number; timestamp?: string | null } | null;
    }>(`/tracking/details?booking_id=${bookingId}`, { headers: withBearer(getUserToken()) }),
};

export const caregiverAPI = {
  getMe: () => api.get<{ caregiver: CaregiverProfileSummary }>("/caregiver/me", { headers: withBearer(getCaregiverToken()) }),
  updateLocation: (payload: { caregiver_id: number; booking_id: number; lat: number; lng: number }) =>
    api.post("/caregiver/update-location", payload, { headers: withBearer(getCaregiverToken()) }),
  updateStatus: (payload: { booking_id: number; status: string }) =>
    api.post("/caregiver/update-status", payload, { headers: withBearer(getCaregiverToken()) }),
  updateAvailability: (payload: { caregiver_id?: number; is_available: boolean; address?: string; latitude?: number; longitude?: number }) =>
    api.post<{ message: string; caregiver?: CaregiverProfileSummary }>("/caregiver/toggle-availability", payload, {
      headers: withBearer(getCaregiverToken()),
    }),
  updateProfileLocation: (payload: { caregiver_id: number; address: string; latitude: number; longitude: number }) =>
    api.post<{ message: string; caregiver?: CaregiverProfileSummary }>("/caregiver/update-profile-location", payload, {
      headers: withBearer(getCaregiverToken()),
    }),
  rejectBooking: (bookingId: number) =>
    api.post(`/booking/reject/${bookingId}`, {}, { headers: withBearer(getCaregiverToken()) }),
  getHistory: () => api.get<{ history: CaregiverHistoryItem[] }>("/caregiver/history", { headers: withBearer(getCaregiverToken()) }),
  getEarningsSummary: () =>
    api.get<CaregiverEarningsSummary>("/caregiver/earnings/summary", { headers: withBearer(getCaregiverToken()) }),
  getPerformance: () =>
    api.get<CaregiverPerformanceSummary>("/caregiver/performance", { headers: withBearer(getCaregiverToken()) }),
  getReviews: () =>
    api.get<{ reviews: CaregiverReviewItem[] }>("/caregiver/reviews", { headers: withBearer(getCaregiverToken()) }),
  getNotifications: () =>
    api.get<{ notifications: AppNotification[] }>("/caregiver/notifications", { headers: withBearer(getCaregiverToken()) }),
  markNotificationRead: (notificationId: number) =>
    api.post(`/caregiver/notifications/${notificationId}/read`, {}, { headers: withBearer(getCaregiverToken()) }),
};

export const profileAPI = {
  getUserProfile: () => api.get<UserProfile>("/profile/me", { headers: withBearer(getUserToken()) }),
  updateUserProfile: (payload: ProfileUpdatePayload) =>
    api.put<UserProfile>("/profile/me", payload, { headers: withBearer(getUserToken()) }),
  getCaregiverProfile: () => api.get<CaregiverProfile>("/profile/me", { headers: withBearer(getCaregiverToken()) }),
  updateCaregiverProfile: (payload: ProfileUpdatePayload) =>
    api.put<CaregiverProfile>("/profile/me", payload, { headers: withBearer(getCaregiverToken()) }),
};

export const adminAPI = {
  getOverview: () => api.get<AdminMetricOverview>("/admin/overview", { headers: withBearer(getAdminToken()) }),
  getBookings: (params?: { status?: string; payment_status?: string; search?: string }) =>
    api.get<{ bookings: AdminBookingRecord[] }>("/admin/bookings", {
      headers: withBearer(getAdminToken()),
      params,
    }),
  getBookingDetail: (bookingId: number) =>
    api.get<{ booking: AdminBookingRecord; eligible_caregivers: AdminCaregiverRecord[] }>(`/admin/bookings/${bookingId}`, {
      headers: withBearer(getAdminToken()),
    }),
  reassignBooking: (bookingId: number, caregiver_id?: number) =>
    api.post<{ message: string; booking: AdminBookingRecord }>(
      `/admin/bookings/${bookingId}/reassign`,
      { caregiver_id: caregiver_id ?? null },
      { headers: withBearer(getAdminToken()) }
    ),
  cancelBooking: (bookingId: number, reason: string) =>
    api.post<{ message: string; booking: AdminBookingRecord }>(
      `/admin/bookings/${bookingId}/cancel`,
      { reason },
      { headers: withBearer(getAdminToken()) }
    ),
  getLiveJobs: () => api.get<{ jobs: AdminBookingRecord[] }>("/admin/live-jobs", { headers: withBearer(getAdminToken()) }),
  getPaymentsSummary: () =>
    api.get<{
      summary: AdminPaymentSummary;
      by_caregiver: AdminCaregiverEarning[];
      transactions: AdminPaymentTransaction[];
    }>("/admin/payments/summary", { headers: withBearer(getAdminToken()) }),
  getCaregiverManagement: () =>
    api.get<{ caregivers: AdminCaregiverRecord[] }>("/admin/caregivers", { headers: withBearer(getAdminToken()) }),
  getApprovals: () => api.get<{ caregivers: CaregiverProfileSummary[] }>("/caregiver/all", { headers: withBearer(getAdminToken()) }),
  approveCaregiver: (id: number) => api.post(`/caregiver/approve/${id}`, {}, { headers: withBearer(getAdminToken()) }),
  rejectCaregiver: (id: number) => api.post(`/caregiver/reject/${id}`, {}, { headers: withBearer(getAdminToken()) }),
  enableCaregiver: (id: number) => api.post(`/admin/caregivers/${id}/enable`, {}, { headers: withBearer(getAdminToken()) }),
  disableCaregiver: (id: number) => api.post(`/admin/caregivers/${id}/disable`, {}, { headers: withBearer(getAdminToken()) }),
  forceOfflineCaregiver: (id: number) =>
    api.post(`/admin/caregivers/${id}/force-offline`, {}, { headers: withBearer(getAdminToken()) }),
  getReviews: () => api.get<{ reviews: AdminReviewRecord[] }>("/admin/reviews", { headers: withBearer(getAdminToken()) }),
  getNotifications: () =>
    api.get<{ notifications: AppNotification[] }>("/admin/notifications", { headers: withBearer(getAdminToken()) }),
  getFaceReview: (bookingId: number) =>
    api.get<AdminFaceReviewRecord>(`/admin/booking/${bookingId}/face-review`, { headers: withBearer(getAdminToken()) }),
  approveFaceOverride: (bookingId: number) =>
    api.post<{ message: string; booking_id: number }>(`/admin/booking/${bookingId}/face-override`, {}, { headers: withBearer(getAdminToken()) }),
};

export const paymentAPI = {
  createOrder: (bookingId: number) =>
    api.post<PaymentOrderResponse>("/payment/create-order", { booking_id: bookingId }, { headers: withBearer(getUserToken()) }),
  verify: (payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    api.post<PaymentVerificationResponse>("/payment/verify", payload, { headers: withBearer(getUserToken()) }),
  confirmCash: (bookingId: number) =>
    api.post<PaymentVerificationResponse>("/payment/confirm-cash", { booking_id: bookingId }, { headers: withBearer(getUserToken()) }),
  pay: (bookingId: number) => api.post(`/payment/pay/${bookingId}`, {}, { headers: withBearer(getUserToken()) }),
  getStatus: (bookingId: number) =>
    api.get<PaymentStatusResponse>(`/payment/status/${bookingId}`, { headers: withBearer(getUserToken()) }),
};

export const locationAPI = {
  geocodeAddress: (address: string) =>
    api.post<{ address: string; latitude: number; longitude: number }>("/location/geocode", { address }),
};

export const getWebSocketURL = (bookingId: string) => `${WS_BASE_URL}/tracking/ws/${bookingId}`;
export const getTrackingWebSocketUrl = (bookingId: number | string) => `${WS_BASE_URL}/tracking/ws/${bookingId}`;
export const getCaregiverDocumentUrl = (docId: number) => `${API_BASE_URL}/caregiver/document/${docId}`;
export const getQrCodeUrl = (qrCodePath?: string | null) =>
  qrCodePath ? `${API_BASE_URL}/${qrCodePath.replace(/^\/+/, "")}` : null;

export default api;
