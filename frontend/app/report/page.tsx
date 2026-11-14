import {Suspense} from "react";
import {ReportEditor} from "@/components/report-editor";
export default function Page(){return <Suspense fallback={<p>Loading…</p>}><ReportEditor/></Suspense>}
