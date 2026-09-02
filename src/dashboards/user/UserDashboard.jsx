import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';

function UserDashboard() {
  return (
    <div style={{ padding: '20px' }}>
      <h2>User Dashboard - Report Accident</h2>
      <button onClick={() => signOut(auth)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
        Logout
      </button>
      
      <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '20px' }}>
        <h3>Phase 1 Features - Coming Soon</h3>
        <ul>
          <li>📍 Location Capture</li>
          <li>📸 Photo Upload</li>
          <li>🚨 Send Alert to Hospitals & Nearby Users</li>
        </ul>
      </div>
    </div>
  );
}

export default UserDashboard;