import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Toasts globais Âncora — canto superior direito, com fechar e auto-sumir. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-right"
      closeButton
      richColors
      expand={false}
      visibleToasts={4}
      gap={10}
      offset={16}
      className="toaster group"
      toastOptions={{
        duration: 4200,
        classNames: {
          toast:
            "group toast group-[.toaster]:border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:text-[13.5px] group-[.toaster]:font-medium",
          title: "group-[.toast]:pr-4",
          description: "group-[.toast]:text-[12.5px] group-[.toast]:opacity-90",
          closeButton:
            "group-[.toast]:!bg-white group-[.toast]:!border-black/10 group-[.toast]:!text-black/70",
          success:
            "group-[.toaster]:!bg-emerald-50 group-[.toaster]:!text-emerald-950 group-[.toaster]:!border-emerald-300",
          error:
            "group-[.toaster]:!bg-red-50 group-[.toaster]:!text-red-900 group-[.toaster]:!border-red-300",
          info: "group-[.toaster]:!bg-sky-50 group-[.toaster]:!text-sky-950 group-[.toaster]:!border-sky-300",
          warning:
            "group-[.toaster]:!bg-amber-50 group-[.toaster]:!text-amber-950 group-[.toaster]:!border-amber-300",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
