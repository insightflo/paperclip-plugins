import { type PluginPageProps, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { type JSX } from "react";
export declare function WorkflowPage(props: PluginPageProps): JSX.Element;
export declare function WorkflowDashboardWidget(props: PluginWidgetProps): JSX.Element;
export declare function WorkflowSidebarLink({ context }: {
    context: {
        companyPrefix?: string | null;
    };
}): import("react/jsx-runtime").JSX.Element;
