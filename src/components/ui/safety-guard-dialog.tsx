'use client';
import { AlertTriangle, Ban, CheckCircle, X } from 'lucide-react';

interface ValidationResult {
  status: 'OK' | 'WARNING' | 'BLOCK';
  code?: string;
  message?: string;
  details?: string;
  allow_override?: boolean;
}

interface SafetyGuardProps {
  isOpen: boolean;
  validation: ValidationResult | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function SafetyGuardDialog({ isOpen, validation, onClose, onConfirm }: SafetyGuardProps) {
  if (!isOpen || !validation || validation.status === 'OK') return null;

  const isBlock = validation.status === 'BLOCK';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className={`bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border-t-8 ${isBlock ? 'border-red-600' : 'border-amber-500'}`}>

        {/* Header */}
        <div className={`p-6 ${isBlock ? 'bg-red-50' : 'bg-amber-50'} flex gap-4 items-start`}>
          <div className={`p-3 rounded-full ${isBlock ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
            {isBlock ? <Ban size={32} /> : <AlertTriangle size={32} />}
          </div>
          <div>
            <h3 className={`text-xl font-bold ${isBlock ? 'text-red-900' : 'text-amber-900'}`}>
              {validation.message}
            </h3>
            <p className={`mt-1 text-sm ${isBlock ? 'text-red-700' : 'text-amber-800'}`}>
              {validation.code}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="text-gray-700 font-medium mb-2">פרטי הקונפליקט:</div>
          <p className="text-gray-600 bg-gray-50 p-3 rounded border border-gray-200 text-sm">
            {validation.details}
          </p>

          {isBlock && (
            <div className="mt-4 text-xs text-red-500 font-bold flex items-center gap-1">
              <X size={12} /> פעולה זו חסומה על ידי המערכת למניעת טעויות.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-gray-50 flex justify-end gap-3 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            {isBlock ? 'הבנתי, סגור' : 'ביטול'}
          </button>

          {!isBlock && (
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition-colors shadow-sm flex items-center gap-2"
            >
              <CheckCircle size={16} />
              אשר שיבוץ בכל זאת
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
