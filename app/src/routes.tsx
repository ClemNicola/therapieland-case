import { Navigate, type RouteObject } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/auth/LoginPage";
import { PatientsPage } from "./pages/patients/PatientsPage";

// Paths hold UUIDs at most: never search terms or patient data (see AGENTS.md).
export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [{ path: "/patients", element: <PatientsPage /> }],
      },
    ],
  },
  { path: "*", element: <Navigate to="/patients" replace /> }, // includes /
];
