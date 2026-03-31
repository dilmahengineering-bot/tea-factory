import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '4rem', lineHeight: 1 }}>🍃</div>
      <h1 style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--text-dim)' }}>404</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '1.125rem' }}>Page not found</p>
      <Link to="/" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>Back to dashboard</Link>
    </div>
  );
}
