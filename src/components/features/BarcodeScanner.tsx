import { useEffect, useRef, useState } from 'react';
import { X, ScanLine, Camera } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

const BarcodeScanner = ({ onScan, onClose }: BarcodeScannerProps) => {
  const { interact } = useInteraction();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }

      // Use BarcodeDetector API if available
      if ('BarcodeDetector' in window) {
        startBarcodeDetection(stream);
      }
    } catch {
      setError('تعذر الوصول إلى الكاميرا. يرجى السماح بالوصول أو إدخال الباركود يدويًا.');
    }
  };

  const startBarcodeDetection = (stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    // @ts-ignore
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let scanning = true;
    const detect = async () => {
      if (!scanning || !videoRef.current || videoRef.current.readyState < 2) {
        if (scanning) requestAnimationFrame(detect);
        return;
      }
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx?.drawImage(videoRef.current, 0, 0);
      try {
        const barcodes = await detector.detect(canvas);
        if (barcodes.length > 0) {
          scanning = false;
          interact('success');
          stopCamera();
          onScan(barcodes[0].rawValue);
          return;
        }
      } catch { /* ignore */ }
      if (scanning) requestAnimationFrame(detect);
    };
    requestAnimationFrame(detect);

    // Cleanup
    return () => { scanning = false; };
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const handleManualSubmit = () => {
    if (!manualInput.trim()) return;
    interact('success');
    stopCamera();
    onScan(manualInput.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-foreground">مسح الباركود</span>
          </div>
          <button
            className="icon-btn w-8 h-8 glass text-muted-foreground hover:text-red-400"
            onClick={() => { interact('click'); stopCamera(); onClose(); }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera viewport */}
        <div className="relative rounded-2xl overflow-hidden border-2 border-blue-500/50 bg-black" style={{ aspectRatio: '4/3' }}>
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />

          {/* Scan overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-52 h-40 relative">
              <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-blue-400 rounded-tr-lg" style={{ borderWidth: '3px' }} />
              <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-blue-400 rounded-tl-lg" style={{ borderWidth: '3px' }} />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-blue-400 rounded-br-lg" style={{ borderWidth: '3px' }} />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-blue-400 rounded-bl-lg" style={{ borderWidth: '3px' }} />
              <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-blue-400/80 animate-pulse" />
            </div>
          </div>

          {!cameraActive && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-2 animate-pulse" />
                <p className="text-sm text-muted-foreground">جاري تشغيل الكاميرا...</p>
              </div>
            </div>
          )}
        </div>

        {error ? (
          <div className="mt-3 p-3 bg-amber-500/15 border border-amber-500/25 rounded-xl">
            <p className="text-sm text-amber-400 mb-1">{error}</p>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground mt-3">
            {cameraActive ? 'وجّه الكاميرا نحو الباركود للمسح التلقائي' : 'جاري التهيئة...'}
          </p>
        )}

        {/* Manual input fallback */}
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-2 text-center">أو أدخل الباركود يدويًا</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder="أدخل رقم الباركود..."
              className="flex-1 bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground font-mono focus:outline-none focus:border-primary/50"
              onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
              dir="ltr"
            />
            <button
              className="icon-btn px-4 py-2.5 gradient-blue text-white rounded-xl text-sm font-semibold"
              onClick={handleManualSubmit}
            >
              تأكيد
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;
