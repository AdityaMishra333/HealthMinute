import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';

function DriverDashboard() {
  return (
    <div style={{ padding: '20px' }}>
      <h2>Ambulance Driver Dashboard</h2>
      <button onClick={() => signOut(auth)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
        Logout
      </button>
      
      <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '20px' }}>
        <h3>Phase 1 Features - Coming Soon</h3>
        <ul>
          <li>📋 View Assigned Case</li>
          <li>🗺️ Navigation to Accident Location</li>
          <li>⚡ Route Optimization via Google Maps</li>
        </ul>
      </div>
    </div>
  );
}

export default DriverDashboard;