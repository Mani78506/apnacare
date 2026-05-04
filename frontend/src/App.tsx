import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import IndexPage from "@/pages/Index";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import HomePage from "@/pages/HomePage";
import BookingPage from "@/pages/BookingPage";
import TrackingPage from "@/pages/TrackingPage";
import AdminDashboardPage from "@/pages/AdminDashboardPage";
import AdminLoginPage from "@/pages/AdminLoginPage";
import CaregiverLoginPage from "@/pages/CaregiverLoginPage";
import CaregiverForgotPasswordPage from "@/pages/CaregiverForgotPasswordPage";
import CaregiverDashboardPage from "@/pages/CaregiverDashboardPage";
import CaregiverJobPage from "@/pages/CaregiverJobPage";
import CaregiverProfilePage from "@/pages/CaregiverProfilePage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import UserProfilePage from "@/pages/UserProfilePage";
import AdminProtectedRoute from "@/components/AdminProtectedRoute";
import ProtectedRoute from "@/components/ProtectedRoute";
import CaregiverProtectedRoute from "@/components/CaregiverProtectedRoute";
import PortalLoginRoute from "@/components/PortalLoginRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" duration={3500} closeButton />
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route
          path="/login"
          element={
            <PortalLoginRoute role="user">
              <LoginPage />
            </PortalLoginRoute>
          }
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/admin/login"
          element={
            <PortalLoginRoute role="admin">
              <AdminLoginPage />
            </PortalLoginRoute>
          }
        />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/admin/dashboard"
          element={
            <AdminProtectedRoute>
              <AdminDashboardPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/booking"
          element={
            <ProtectedRoute>
              <BookingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <UserProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tracking/:bookingId"
          element={
            <ProtectedRoute>
              <TrackingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/caregiver/login"
          element={
            <PortalLoginRoute role="caregiver">
              <CaregiverLoginPage />
            </PortalLoginRoute>
          }
        />
        <Route path="/caregiver/forgot-password" element={<CaregiverForgotPasswordPage />} />
        <Route
          path="/caregiver/dashboard"
          element={
            <CaregiverProtectedRoute>
              <CaregiverDashboardPage />
            </CaregiverProtectedRoute>
          }
        />
        <Route
          path="/caregiver/job/:id"
          element={
            <CaregiverProtectedRoute>
              <CaregiverJobPage />
            </CaregiverProtectedRoute>
          }
        />
        <Route
          path="/caregiver/profile"
          element={
            <CaregiverProtectedRoute>
              <CaregiverProfilePage />
            </CaregiverProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
