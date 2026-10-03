export default function ResponsiveForm({ children, className = '', ...props }) {
  return (
    <form
      {...props}
      className={`responsive-form grid grid-cols-1 gap-x-4 md:grid-cols-2 ${className}`.trim()}
    >
      {children}
    </form>
  );
}
