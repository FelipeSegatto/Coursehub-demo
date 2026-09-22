import NavbarTeacher from "../components/NavbarTeacher";
import { Outlet } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import DemoGuide from "../components/demo/DemoGuide";

export default function TeacherLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <NavbarTeacher />
      <main className="flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
      <SiteFooter variant="app" />
      <DemoGuide />
    </div>
  );
}
