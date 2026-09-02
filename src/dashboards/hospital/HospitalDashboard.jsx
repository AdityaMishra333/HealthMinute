import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';

function HospitalDashboard() {
  return (
    <div style={{ padding: '20px' }}>
      <h2>Hospital Dashboard - Incoming Alerts</h2>
      <button onClick={() => signOut(auth)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
        Logout
      </button>
      
      <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '20px' }}>
        <h3>Phase 1 Features - Coming Soon</h3>
        <ul>
          <li>🚨 View Incoming Accident Alerts</li>
          <li>⚠️ Check Severity & Genuineness Score</li>
          <li>⏱️ Track Ambulance ETA</li>
        </ul>
      </div>
    </div>
  );
}

export default HospitalDashboard;
