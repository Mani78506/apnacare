import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminProtectedRoute from "@/components/AdminProtectedRoute";
import CaregiverProtectedRoute from "@/components/CaregiverProtectedRoute";
import PortalLoginRoute from "@/components/PortalLoginRoute";
import { useStore } from "@/store/useStore";
import { useAdminStore } from "@/store/useAdminStore";
import { useCaregiverStore } from "@/store/useCaregiverStore";
import { getStoredCaregiverUser, getStoredSharedUser } from "@/lib/session";

function renderWithRouter(initialPath: string, element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path={initialPath} element={element} />
          <Route path="/login" element={<div>patient-login</div>} />
          <Route path="/admin/login" element={<div>admin-login</div>} />
          <Route path="/caregiver/login" element={<div>caregiver-login</div>} />
          <Route path="/home" element={<div>patient-home</div>} />
          <Route path="/admin/dashboard" element={<div>admin-dashboard</div>} />
          <Route path="/caregiver/dashboard" element={<div>caregiver-dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );
  });

  return {
    container,
    root,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function expectText(container: HTMLElement, text: string) {
  expect(container.textContent).toContain(text);
}

describe("portal route guards", () => {
  let mountedRoots: Array<{ cleanup: () => void }> = [];

  beforeEach(() => {
    mountedRoots.forEach(({ cleanup }) => cleanup());
    mountedRoots = [];
    localStorage.clear();
    useStore.setState({
      user: null,
      token: null,
      bookingId: null,
      caregiverLocation: null,
      bookingStatus: "pending",
      eta: null,
    });
    useCaregiverStore.setState({
      token: null,
      user: null,
      caregiverId: null,
      currentBooking: null,
      liveLocation: null,
    });
    useAdminStore.setState({
      token: null,
      user: null,
    });
  });

  it("keeps admin sessions out of patient protected routes on refresh", () => {
    useStore.setState({
      token: "admin-token",
      user: { name: "Admin", email: "admin@example.com", role: "admin" },
    });

    const view = renderWithRouter(
      "/home",
      <ProtectedRoute>
        <div>patient-area</div>
      </ProtectedRoute>
    );

    mountedRoots.push(view);
    expectText(view.container, "patient-login");
  });

  it("keeps patient sessions out of admin protected routes on refresh", () => {
    useStore.setState({
      token: "user-token",
      user: { name: "User", email: "user@example.com", role: "user" },
    });

    const view = renderWithRouter(
      "/admin/dashboard",
      <AdminProtectedRoute>
        <div>admin-area</div>
      </AdminProtectedRoute>
    );

    mountedRoots.push(view);
    expectText(view.container, "admin-login");
  });

  it("redirects only matching sessions away from their own login portal", () => {
    useAdminStore.setState({
      token: "admin-token",
      user: { name: "Admin", email: "admin@example.com", role: "admin" },
    });

    const view = renderWithRouter(
      "/admin/login",
      <PortalLoginRoute role="admin">
        <div>admin-login-form</div>
      </PortalLoginRoute>
    );

    mountedRoots.push(view);
    expectText(view.container, "admin-dashboard");
  });

  it("allows patient login page to stay visible even if an admin session exists", () => {
    useStore.setState({
      token: "admin-token",
      user: { name: "Admin", email: "admin@example.com", role: "admin" },
    });

    const view = renderWithRouter(
      "/login",
      <PortalLoginRoute role="user">
        <div>patient-login-form</div>
      </PortalLoginRoute>
    );

    mountedRoots.push(view);
    expectText(view.container, "patient-login-form");
  });

  it("keeps caregiver routes isolated from the shared admin or patient store", () => {
    useStore.setState({
      token: "admin-token",
      user: { name: "Admin", email: "admin@example.com", role: "admin" },
    });

    const view = renderWithRouter(
      "/caregiver/dashboard",
      <CaregiverProtectedRoute>
        <div>caregiver-area</div>
      </CaregiverProtectedRoute>
    );

    mountedRoots.push(view);
    expectText(view.container, "caregiver-login");
  });

  it("restores user roles from stored session payloads", () => {
    const userPayload = btoa(JSON.stringify({ role: "user" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const caregiverPayload = btoa(JSON.stringify({ role: "caregiver" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    localStorage.setItem("apnacare_token", `header.${userPayload}.sig`);
    localStorage.setItem("apnacare_user", JSON.stringify({ id: 1, name: "Patient" }));
    localStorage.setItem("apnacare_caregiver_token", `header.${caregiverPayload}.sig`);
    localStorage.setItem("apnacare_caregiver_user", JSON.stringify({ id: 2, name: "Caregiver" }));

    expect(getStoredSharedUser()?.role).toBe("user");
    expect(getStoredCaregiverUser()?.role).toBe("caregiver");
  });
});
