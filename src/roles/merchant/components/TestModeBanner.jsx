// src/roles/merchant/components/TestModeBanner.jsx
// Banner shown when merchant is in test mode

export default function TestModeBanner({ onSwitch }) {
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-lg">🧪</span>
        <span className="font-semibold text-sm">TEST MODE</span>
        <span className="text-sm opacity-80">— Transactions are simulated and won't affect real balance</span>
      </div>
      {onSwitch && (
        <button
          onClick={onSwitch}
          className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg font-medium"
        >
          Switch to Live
        </button>
      )}
    </div>
  );
}
