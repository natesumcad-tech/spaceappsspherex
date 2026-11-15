import { ViewTransition, type ReactNode } from "react";
import "./page-transition.css";

export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      default="none"
      enter={{ "site-navigation": "site-page-fade", default: "none" }}
      exit={{ "site-navigation": "site-page-fade", default: "none" }}
    >
      {children}
    </ViewTransition>
  );
}
