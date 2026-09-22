import NavbarAdmin from "../components/NavbarAdmin";
import { Outlet } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import DemoGuide from "../components/demo/DemoGuide";

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="print-hide">
        <NavbarAdmin />
      </div>
      <main className="flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
      <SiteFooter variant="app" />
      <DemoGuide />
    </div>
  );
}
