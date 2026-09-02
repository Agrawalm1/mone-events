import './globals.css';

export const metadata = {
  title: 'Invitation',
  description: 'You are invited.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
