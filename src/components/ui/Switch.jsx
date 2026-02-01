// Switch.jsx
export default function Switch({ checked, onChange, ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`inline-flex w-11 h-6 rounded-full transition ${checked ? 'bg-green-500' : 'bg-gray-300'}`}
      onClick={() => onChange && onChange(!checked)}
      {...props}
    >
      <span
        className={`block w-5 h-5 bg-white rounded-full shadow transform transition ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}
