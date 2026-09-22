import { Outlet } from "react-router-dom";
import NavbarStudent from "../components/NavbarStudent";
import SiteFooter from "../components/SiteFooter";
import DemoGuide from "../components/demo/DemoGuide";

export default function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-800">
      <NavbarStudent />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <SiteFooter variant="app" />
      <DemoGuide />
    </div>
  );
}
