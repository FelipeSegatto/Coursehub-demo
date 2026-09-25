import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import SiteFooter from "../components/SiteFooter";
import DemoGuide from "../components/demo/DemoGuide";
import { clearLeaveToHome } from "../auth/AuthContext";

export default function PublicLayout() {
  useEffect(() => {
    clearLeaveToHome();
  }, []);
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1">
        <Outlet />
      </main>

      <SiteFooter variant="public" />
      <DemoGuide />
    </div>
  );
}
