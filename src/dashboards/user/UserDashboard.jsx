import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';

function UserDashboard() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleGetLocation = () => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setError('');
        setLoading(false);
      },
      (err) => {
        setError('Could not get your location: ' + err.message);
        setLoading(false);
      }
    );
  };

  const handleReportAccident = async () => {
    if (!location) {
      setError('Capture your location first');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'accidents'), {
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        latitude: location.latitude,
        longitude: location.longitude,
        status: 'reported',
        createdAt: serverTimestamp(),
      });

      setSuccess('Accident reported. Help is on the way.');
      setLocation(null);
      setError('');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError('Could not submit the report: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="page">
      <div className="topbar">
        <h1>HealthMinute — Report an accident</h1>
        <button className="btn btn-ghost" onClick={() => signOut(auth)}>
          Log out
        </button>
      </div>

      <div className="container">
        <div className="card">
          <p className="card-title">Location</p>
          <button className="btn btn-primary" onClick={handleGetLocation} disabled={loading}>
            {loading && !location ? 'Getting location…' : 'Capture current location'}
          </button>
          {location && (
            <p className="status-line status-ok">
              Location captured — {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </p>
          )}
        </div>

        <div className="card">
          <p className="card-title">Submit report</p>
          <button
            className="btn btn-danger"
            onClick={handleReportAccident}
            disabled={loading || !location}
          >
            {loading ? 'Submitting…' : 'Report accident'}
          </button>

          {error && <p className="status-line status-error">{error}</p>}
          {success && <p className="status-line status-ok">{success}</p>}
        </div>
      </div>
    </div>
  );
}

export default UserDashboard;
