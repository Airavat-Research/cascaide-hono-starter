'use client';

const SLOTS = [1, 2, 3, 4] as const;

export function RightSidebar() {
  return (
    <aside
      style={{
        width: 320,
        minWidth: 320,
        height: '100%',
        flexShrink: 0,
        padding: '16px', // Added padding for better spacing
        borderLeft: '1px solid #eaeaea', // Optional: adds definition
        overflowY: 'auto',
      }}
    >
      <h2
        style={{
          fontSize: '1.25rem',
          fontWeight: '600',
          marginBottom: '16px',
          color: '#333',
        }}
      >
        Recursion Tracker
      </h2>
      
      {SLOTS.map(id => (
        <div key={id} id={`right-sidebar-slot-${id}`} />
      ))}
    </aside>
  );
}