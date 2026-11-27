import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Clock3,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Mail,
  Moon,
  ChevronLeft,
  ChevronRight,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Sun,
  Trash2,
  TrendingUp,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Utensils,
  X
} from 'lucide-react';
import {
  checkInStaff,
  checkOutStaff,
  getAttendanceRecords,
  getCached,
  getLeaveRequests,
  getStaffList,
  saveManualAttendance,
  submitLeaveRequest,
  updateLeaveRequestStatus
} from '../lib/data';
import { StaffProfile, supabase } from '../lib/supabase';

export function StaffPage({
  profile,
  setNotice,
  globalSearch
}: {
  profile?: StaffProfile | null;
  setNotice?: (n: any) => void;
  globalSearch?: string;
}) {
  const isAdmin = !profile || profile.role === 'admin';
  const isEmployee = profile?.role === 'employee' || profile?.role === 'kitchen';

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'staff' | 'attendance' | 'leaves' | 'scanner'>('staff');

  // Staff Management state
  const [staff, setStaff] = useState<any[]>(() => getCached<any[]>('staff') || []);
  const [roleFilter, setRoleFilter] = useState('all');
  const [searchStaff, setSearchStaff] = useState(globalSearch || '');
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');

  useEffect(() => {
    if (globalSearch !== undefined) {
      setSearchStaff(globalSearch);
    }
  }, [globalSearch]);
  const [newStaffRole, setNewStaffRole] = useState('employee');
  const [savingStaff, setSavingStaff] = useState(false);

  // Attendance state
  const [attendance, setAttendance] = useState<any[]>(() => getCached<any[]>('attendance') || []);
  const getTodayIso = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getYesterdayIso = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [attRoleFilter, setAttRoleFilter] = useState('all');
  const [attStatusFilter, setAttStatusFilter] = useState('all');
  const [checkInCode, setCheckInCode] = useState('8F3K9D2M');
  const [checkOutCode, setCheckOutCode] = useState('T7M4Q9ZB');
  const [checkInQrUrl, setCheckInQrUrl] = useState('');
  const [checkOutQrUrl, setCheckOutQrUrl] = useState('');
  const [selectedAttMember, setSelectedAttMember] = useState<any | null>(null);
  const [showAttDetailsModal, setShowAttDetailsModal] = useState(false);
  const [selectedAttDate, setSelectedAttDate] = useState(() => getTodayIso());
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showAddAttendanceModal, setShowAddAttendanceModal] = useState(false);
  const [showAllLogsModal, setShowAllLogsModal] = useState(false);
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);
  const [attPage, setAttPage] = useState(1);
  const [attRowsPerPage, setAttRowsPerPage] = useState(10);

  // Manual Attendance Form State
  const [manualStaffId, setManualStaffId] = useState('');
  const [manualDate, setManualDate] = useState(() => getTodayIso());
  const [manualStatus, setManualStatus] = useState<'present' | 'late' | 'absent'>('present');
  const [manualCheckIn, setManualCheckIn] = useState('09:00');
  const [manualCheckOut, setManualCheckOut] = useState('18:00');
  const [savingManualAtt, setSavingManualAtt] = useState(false);

  // Scanner & Code check-in state (for Staff/Waiter)
  const [inputCode, setInputCode] = useState('');
  const [scanningActive, setScanningActive] = useState(false);
  const [checkingInOut, setCheckingInOut] = useState(false);
  const [selectedStaffForScan, setSelectedStaffForScan] = useState<string>('');

  // Leave Requests state
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [selectedLeave, setSelectedLeave] = useState<any | null>(null);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
  const [leaveRoleFilter, setLeaveRoleFilter] = useState('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');
  const [updatingLeave, setUpdatingLeave] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionComment, setRejectionComment] = useState('');

  // Waiter/Staff New Leave Modal
  const [showNewLeaveModal, setShowNewLeaveModal] = useState(false);
  const [newLeaveType, setNewLeaveType] = useState('Casual');
  const [newLeaveStart, setNewLeaveStart] = useState('');
  const [newLeaveEnd, setNewLeaveEnd] = useState('');
  const [newLeaveReason, setNewLeaveReason] = useState('');
  const [calViewDate, setCalViewDate] = useState(() => new Date());

  // Generate QR codes with Servora emblem logo embedded directly into canvas
  useEffect(() => {
    const createQrWithEmblem = async (text: string): Promise<string> => {
      try {
        const qrCanvas = document.createElement('canvas');
        qrCanvas.width = 300;
        qrCanvas.height = 300;
        await QRCode.toCanvas(qrCanvas, text, {
          width: 300,
          margin: 1,
          errorCorrectionLevel: 'H',
          color: { dark: '#1c100a', light: '#ffffff' }
        });

        const ctx = qrCanvas.getContext('2d');
        if (!ctx) return qrCanvas.toDataURL('image/png');

        // Load the uploaded Servora emblem
        const emblemImg = new Image();
        emblemImg.crossOrigin = 'anonymous';
        emblemImg.src = '/servora-qr-logo.png';

        await new Promise<void>((resolve) => {
          if (emblemImg.complete && emblemImg.naturalWidth > 0) return resolve();
          emblemImg.onload = () => resolve();
          emblemImg.onerror = () => resolve();
        });

        if (emblemImg.complete && emblemImg.naturalWidth > 0) {
          const logoSize = 68; // ~22.6% of 300, perfectly scannable with H error correction
          const center = 150;

          // Pure white circle background with crisp border
          ctx.beginPath();
          ctx.arc(center, center, (logoSize / 2) + 4, 0, 2 * Math.PI);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ebd9c8';
          ctx.stroke();

          // Clip to circle and draw the emblem centered
          ctx.save();
          ctx.beginPath();
          ctx.arc(center, center, logoSize / 2, 0, 2 * Math.PI);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(emblemImg, center - (logoSize / 2), center - (logoSize / 2), logoSize, logoSize);
          ctx.restore();
        }

        return qrCanvas.toDataURL('image/png');
      } catch (err) {
        console.error('Error generating QR code with emblem:', err);
        return '';
      }
    };

    const generateBothQrs = async () => {
      const inUrl = await createQrWithEmblem(`servora://attendance?action=checkin&code=${checkInCode}`);
      const outUrl = await createQrWithEmblem(`servora://attendance?action=checkout&code=${checkOutCode}`);
      setCheckInQrUrl(inUrl);
      setCheckOutQrUrl(outUrl);
    };

    generateBothQrs();
  }, [checkInCode, checkOutCode]);

  const loadAllData = async (force = false) => {
    try {
      const [sList, attList, leavesList] = await Promise.all([
        getStaffList(force),
        getAttendanceRecords(force),
        getLeaveRequests(force)
      ]);
      if (sList && sList.length > 0) {
        setStaff(sList);
        if (!selectedStaffForScan) {
          setSelectedStaffForScan(sList[0].id);
        }
      }
      if (attList && attList.length > 0) setAttendance(attList);
      if (leavesList && leavesList.length > 0) {
        setLeaveRequests(leavesList);
        if (!selectedLeave) {
          setSelectedLeave(leavesList[0]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Supabase Realtime synchronization for attendance and profiles
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel('admin-attendance-sync-stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        loadAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadAllData();
      })
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, []);

  // Helper functions for culinary roles, avatars, and time calculation
  const getStaffRoleTitle = (member: any) => {
    if (member?.role_title) return member.role_title;
    const name = (member?.full_name || '').toLowerCase();
    if (name.includes('ramesh')) return 'Head Chef';
    if (name.includes('karthik') || name.includes('mani')) return 'Cook';
    if (name.includes('selvi') || name.includes('prabhu')) return 'Kitchen Helper';
    if (name.includes('kavitha') || name.includes('arjun')) return 'Service Staff';
    if (name.includes('divya')) return 'Cashier';
    if (name.includes('murugan')) return 'Steward';
    if (name.includes('anand')) return 'Maintenance';
    if (member?.role === 'admin') return 'Head Chef';
    if (member?.role === 'kitchen') return 'Cook';
    return 'Service Staff';
  };

  const getRoleBadgeClass = (roleStr: string) => {
    const r = (roleStr || '').toLowerCase();
    if (r.includes('head chef')) return 'role-chip-head-chef';
    if (r.includes('cook')) return 'role-chip-cook';
    if (r.includes('helper')) return 'role-chip-helper';
    if (r.includes('service')) return 'role-chip-service';
    if (r.includes('cashier')) return 'role-chip-cashier';
    if (r.includes('steward')) return 'role-chip-steward';
    return 'role-chip-maintenance';
  };

  const getStaffAvatar = (member: any) => {
    if (member?.avatar_url) return member.avatar_url;
    const name = (member?.full_name || '').toLowerCase();
    if (name.includes('ramesh')) return 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=120&auto=format&fit=crop&q=80';
    if (name.includes('karthik')) return 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=120&auto=format&fit=crop&q=80';
    if (name.includes('mani')) return 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80';
    if (name.includes('selvi')) return 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80';
    if (name.includes('prabhu')) return 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80';
    if (name.includes('kavitha')) return 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&auto=format&fit=crop&q=80';
    if (name.includes('arjun')) return 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80';
    if (name.includes('divya')) return 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';
    if (name.includes('murugan')) return 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80';
    return 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&auto=format&fit=crop&q=80';
  };

  const formatDateDisplay = (isoStr: string) => {
    try {
      const parts = isoStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      }
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return isoStr;
    }
  };

  const formatTimeDisplay = (isoStr?: string | null) => {
    if (!isoStr) return '--';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--';
    }
  };

  const calcHoursWorked = (inTs?: string | null, outTs?: string | null) => {
    if (!inTs || !outTs) return '--';
    try {
      const start = new Date(inTs).getTime();
      const end = new Date(outTs).getTime();
      if (end <= start) return '--';
      const diffMins = Math.round((end - start) / 60000);
      const hrs = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
    } catch {
      return '--';
    }
  };

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualStaffId) {
      if (setNotice) setNotice({ text: 'Please select a staff member.', kind: 'error' });
      return;
    }
    setSavingManualAtt(true);
    try {
      const inIso = manualStatus !== 'absent' && manualCheckIn
        ? `${manualDate}T${manualCheckIn}:00.000Z`
        : null;
      const outIso = manualStatus !== 'absent' && manualCheckOut
        ? `${manualDate}T${manualCheckOut}:00.000Z`
        : null;
      await saveManualAttendance({
        employeeId: manualStaffId,
        workDate: manualDate,
        status: manualStatus,
        checkIn: inIso,
        checkOut: outIso
      });
      if (setNotice) setNotice({ text: 'Attendance record saved successfully!', kind: 'success' });
      setShowAddAttendanceModal(false);
      await loadAllData();
    } catch (err: any) {
      if (setNotice) setNotice({ text: err.message || 'Error saving attendance', kind: 'error' });
    } finally {
      setSavingManualAtt(false);
    }
  };

  // Staff creation
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newStaffName.trim()) return;
    setSavingStaff(true);
    try {
      const { error } = await supabase.from('profiles').insert({
        full_name: newStaffName.trim(),
        email: newStaffEmail.trim() || `${newStaffName.toLowerCase().replace(/\s+/g, '')}@servora.com`,
        phone: newStaffPhone.trim() || '+91 98765 43210',
        role: newStaffRole,
        approval_status: 'approved'
      });
      if (error) throw error;
      if (setNotice) setNotice({ text: `Staff ${newStaffName} registered successfully!`, kind: 'success' });
      setShowAddStaffModal(false);
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPhone('');
      await loadAllData();
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not add staff.', kind: 'error' });
    } finally {
      setSavingStaff(false);
    }
  };

  // Staff / Waiter check-in with 8-char code
  const handlePerformCheckIn = async () => {
    const targetStaffId = profile?.id || selectedStaffForScan;
    if (!targetStaffId) {
      if (setNotice) setNotice({ text: 'Please select a staff member.', kind: 'error' });
      return;
    }
    const cleanCode = inputCode.trim().toUpperCase();
    if (cleanCode && cleanCode !== checkInCode) {
      if (setNotice) setNotice({ text: `Invalid Check-in Code. Today's valid code is ${checkInCode}.`, kind: 'error' });
      return;
    }
    setCheckingInOut(true);
    try {
      await checkInStaff(targetStaffId, cleanCode || checkInCode);
      if (setNotice) setNotice({ text: `Checked in successfully! Shift started.`, kind: 'success' });
      setInputCode('');
      await loadAllData();
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Check-in failed.', kind: 'error' });
    } finally {
      setCheckingInOut(false);
    }
  };

  // Staff / Waiter check-out with 8-char code
  const handlePerformCheckOut = async () => {
    const targetStaffId = profile?.id || selectedStaffForScan;
    if (!targetStaffId) {
      if (setNotice) setNotice({ text: 'Please select a staff member.', kind: 'error' });
      return;
    }
    const cleanCode = inputCode.trim().toUpperCase();
    if (cleanCode && cleanCode !== checkOutCode) {
      if (setNotice) setNotice({ text: `Invalid Check-out Code. Today's valid code is ${checkOutCode}.`, kind: 'error' });
      return;
    }
    setCheckingInOut(true);
    try {
      await checkOutStaff(targetStaffId, cleanCode || checkOutCode);
      if (setNotice) setNotice({ text: `Checked out successfully! Shift logged.`, kind: 'success' });
      setInputCode('');
      await loadAllData();
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Check-out failed.', kind: 'error' });
    } finally {
      setCheckingInOut(false);
    }
  };

  // Leave approval / rejection
  const handleApproveLeave = async (leave: any) => {
    if (!leave?.id || updatingLeave) return;
    setUpdatingLeave(true);
    try {
      await updateLeaveRequestStatus(leave.id, 'approved');
      if (setNotice) setNotice({ text: `Leave request for ${leave.staff_name} approved!`, kind: 'success' });
      setSelectedLeave((prev: any) => (prev ? { ...prev, status: 'approved' } : null));
      await loadAllData();
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Error updating status', kind: 'error' });
    } finally {
      setUpdatingLeave(false);
    }
  };

  const handleConfirmRejectLeave = async () => {
    if (!selectedLeave?.id || updatingLeave) return;
    setUpdatingLeave(true);
    try {
      await updateLeaveRequestStatus(selectedLeave.id, 'rejected', rejectionComment.trim());
      if (setNotice) setNotice({ text: `Leave request rejected with comment logged.`, kind: 'info' });
      setSelectedLeave((prev: any) => (prev ? { ...prev, status: 'rejected', rejection_reason: rejectionComment.trim() } : null));
      setShowRejectModal(false);
      setRejectionComment('');
      await loadAllData();
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Error updating status', kind: 'error' });
    } finally {
      setUpdatingLeave(false);
    }
  };

  // Staff submit new leave
  const handleStaffSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeaveStart || !supabase) return;
    try {
      const rest = await supabase.from('restaurants').select('id').limit(1).maybeSingle();
      const restId = rest.data?.id;

      const payload = {
        restaurant_id: restId,
        employee_id: profile?.id || staff[0]?.id,
        staff_name: profile?.full_name || staff[0]?.full_name || 'Staff Member',
        role: profile?.role === 'kitchen' ? 'Cook' : 'Service Staff',
        leave_type: newLeaveType,
        start_date: newLeaveStart,
        end_date: newLeaveEnd || newLeaveStart,
        duration: newLeaveEnd && newLeaveEnd !== newLeaveStart ? `${newLeaveStart} to ${newLeaveEnd}` : newLeaveStart,
        days: 1,
        reason: newLeaveReason.trim() || 'Personal reason',
        status: 'pending'
      };

      await submitLeaveRequest(payload);
      if (setNotice) setNotice({ text: 'Leave request submitted for administrator review!', kind: 'success' });
      setShowNewLeaveModal(false);
      setNewLeaveReason('');
      setNewLeaveStart('');
      setNewLeaveEnd('');
      await loadAllData();
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not submit leave.', kind: 'error' });
    }
  };

  const handleRegenerateCodes = () => {
    const genCode = () => Math.random().toString(36).substring(2, 10).toUpperCase();
    const inCode = genCode();
    const outCode = genCode();
    setCheckInCode(inCode);
    setCheckOutCode(outCode);
    if (setNotice) setNotice({ text: `Generated new 8-character codes: In: ${inCode}, Out: ${outCode}`, kind: 'success' });
  };

  // Filtered lists: strictly show kitchen employee, cook, waiter (dont include admin, kds, customer)
  const employeeList = staff.filter(s => {
    const role = (s.role || '').toLowerCase();
    const email = (s.email || '').toLowerCase();
    if (role === 'admin' || role === 'customer' || email === 'kitchen@servora.com' || s.id === 'd0000000-0000-0000-0000-000000000099' || email.includes('kds')) {
      return false;
    }
    return true;
  });

  const filteredStaff = employeeList.filter(s => {
    const role = (s.role || '').toLowerCase();
    if (roleFilter !== 'all' && role !== roleFilter.toLowerCase()) return false;
    if (searchStaff.trim()) {
      const q = searchStaff.toLowerCase().trim();
      return (s.full_name || '').toLowerCase().includes(q) || (s.phone || '').includes(q) || (s.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  const totalStaffCount = employeeList.length;

  // Real database dynamic attendance filtering by selected date
  const dailyAttendance = attendance.filter(a => a.work_date === selectedAttDate);
  const todayPresentCount = dailyAttendance.filter(a => a.status === 'present').length;
  const todayLateCount = dailyAttendance.filter(a => a.status === 'late').length;
  const todayAbsentCount = Math.max(0, totalStaffCount - (todayPresentCount + todayLateCount));
  const todayAttendanceRate = totalStaffCount > 0 ? Math.round((todayPresentCount / totalStaffCount) * 100) : 80;

  // Map each staff member to their record on selected date
  const dailyStaffList = staff.map(member => {
    const attRecord = dailyAttendance.find(a => a.employee_id === member.id);
    const roleTitle = getStaffRoleTitle(member);
    const isPresent = attRecord?.status === 'present';
    const isLate = attRecord?.status === 'late';
    const isAbsent = !attRecord || attRecord.status === 'absent';
    const statusText = isPresent ? 'Present' : isLate ? 'Late' : 'Absent';
    const statusTone = isPresent ? 'tone-present' : isLate ? 'tone-late' : 'tone-absent';
    const checkIn = formatTimeDisplay(attRecord?.check_in);
    const checkOut = formatTimeDisplay(attRecord?.check_out);
    const workHours = calcHoursWorked(attRecord?.check_in, attRecord?.check_out);
    const avatarUrl = getStaffAvatar(member);

    return {
      member,
      attRecord,
      roleTitle,
      isPresent,
      isLate,
      isAbsent,
      statusText,
      statusTone,
      checkIn,
      checkOut,
      workHours,
      avatarUrl
    };
  });

  // Filter daily staff list
  const filteredDailyStaff = dailyStaffList.filter(item => {
    if (attRoleFilter !== 'all') {
      if (item.roleTitle.toLowerCase() !== attRoleFilter.toLowerCase()) return false;
    }
    if (attStatusFilter !== 'all') {
      if (item.statusText.toLowerCase() !== attStatusFilter.toLowerCase()) return false;
    }
    return true;
  });

  // Paginated daily attendance rows
  const totalAttPages = Math.max(1, Math.ceil(filteredDailyStaff.length / attRowsPerPage));
  const paginatedDailyStaff = filteredDailyStaff.slice(
    (attPage - 1) * attRowsPerPage,
    attPage * attRowsPerPage
  );

  // Visual Calendar Grid computation for actual calendar selection UI/UX
  const calYear = calViewDate.getFullYear();
  const calMonth = calViewDate.getMonth();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay(); // 0 = Sun
  const totalDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calendarDaysList: { dayNum: number | null; iso: string; hasData: boolean }[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDaysList.push({ dayNum: null, iso: '', hasData: false });
  }
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const iso = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasData = attendance.some(a => a.work_date === iso);
    calendarDaysList.push({ dayNum: d, iso, hasData });
  }

  // Dynamic 7-day trend calculation ending on selectedAttDate
  const trendDays: { isoDate: string; dayLabel: string; rate: number; present: number; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(selectedAttDate);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const dayAtt = attendance.filter(a => a.work_date === iso);
    const pres = dayAtt.filter(a => a.status === 'present').length;
    const rate = totalStaffCount > 0 ? Math.min(100, Math.round((pres / totalStaffCount) * 100)) : 80;
    trendDays.push({ isoDate: iso, dayLabel, rate, present: pres, total: totalStaffCount });
  }

  const trendPoints = trendDays.map((d, idx) => {
    const x = 36 + idx * 35;
    const y = 10 + 52 * (1 - d.rate / 100);
    return { ...d, x, y };
  });
  const trendPolylineStr = trendPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const trendAreaStr = `${trendPoints[0]?.x || 36},64 ${trendPolylineStr} ${trendPoints[trendPoints.length - 1]?.x || 246},64`;

  // Donut Gauge math
  const donutRadius = 38;
  const donutCircumference = 2 * Math.PI * donutRadius; // 238.76
  const donutDashOffset = donutCircumference * (1 - todayAttendanceRate / 100);

  // Dynamic Recent Logs from latest database check-ins and check-outs
  const allLogsFromDb = [...attendance]
    .filter(a => a.check_in || a.check_out)
    .sort((a, b) => new Date(b.created_at || b.check_in || 0).getTime() - new Date(a.created_at || a.check_in || 0).getTime());

  const recentLogs = allLogsFromDb.slice(0, 4).map(rec => {
    const m = staff.find(s => s.id === rec.employee_id) || rec.profiles;
    const name = m?.full_name || 'Staff Member';
    const isOut = !!rec.check_out && (!rec.check_in || new Date(rec.check_out) >= new Date(rec.check_in));
    const isLate = rec.status === 'late';
    const timeFormatted = isOut ? formatTimeDisplay(rec.check_out) : formatTimeDisplay(rec.check_in);
    const actionDesc = isOut
      ? `checked out at ${timeFormatted}`
      : isLate
      ? `checked in at ${timeFormatted} (Late)`
      : `checked in at ${timeFormatted}`;
    const dotColor = isLate ? 'yellow' : 'green';
    const isToday = rec.work_date === selectedAttDate;
    const dateLabel = isToday ? 'Today' : formatDateDisplay(rec.work_date).split(',')[0];
    return { id: rec.id, name, actionDesc, dotColor, dateLabel, raw: rec };
  });

  const totalLeaveRequests = leaveRequests.length;
  const approvedLeaves = leaveRequests.filter(l => l.status === 'approved').length;
  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending').length;
  const rejectedLeaves = leaveRequests.filter(l => l.status === 'rejected').length;

  const filteredLeaves = leaveRequests.filter(l => {
    if (leaveStatusFilter !== 'all' && l.status !== leaveStatusFilter) return false;
    if (leaveRoleFilter !== 'all' && (l.role || '').toLowerCase() !== leaveRoleFilter.toLowerCase()) return false;
    if (leaveTypeFilter !== 'all' && (l.leave_type || '').toLowerCase() !== leaveTypeFilter.toLowerCase()) return false;
    return true;
  });

  return (
    <div className="admin-page-container staff-management-overhaul-page">
      {/* 1. Sub-nav Navigation Tabs */}
      <div className="staff-top-nav-bar">
        <div className="staff-tabs-left">
          <button
            type="button"
            className={`staff-nav-tab-pill ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}
          >
            <Users size={16} /> <span>Employee Management</span>
          </button>
          <button
            type="button"
            className={`staff-nav-tab-pill ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveTab('attendance')}
          >
            <Calendar size={16} /> <span>Attendance</span>
          </button>
          <button
            type="button"
            className={`staff-nav-tab-pill ${activeTab === 'leaves' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaves')}
          >
            <FileText size={16} /> <span>Leave Requests</span>
          </button>
          {/* User request: Remove staff qr and monitor in admin page */}
          {!isAdmin && (
            <button
              type="button"
              className={`staff-nav-tab-pill ${activeTab === 'scanner' ? 'active' : ''}`}
              onClick={() => setActiveTab('scanner')}
            >
              <Camera size={16} /> <span>Staff QR Scanner &amp; Monitor</span>
            </button>
          )}
        </div>

        <div className="staff-actions-right">
          {/* Interactive Date Selector Dropdown (matches reference mockup) */}
          <div className="staff-date-dropdown-container">
            <button
              type="button"
              className={`date-display-chip interactive-date-btn ${showDateDropdown ? 'active' : ''}`}
              onClick={() => setShowDateDropdown(prev => !prev)}
              title="Click to select date from calendar"
            >
              <Calendar size={15} className="date-chip-cal-icon" />
              <span className="date-chip-text">{formatDateDisplay(selectedAttDate)}</span>
              <ChevronDown size={14} className={`date-chip-chevron ${showDateDropdown ? 'open' : ''}`} />
            </button>

            {showDateDropdown && (
              <div className="actual-calendar-popover">
                {/* Calendar Navigation Header */}
                <div className="cal-popover-header">
                  <button
                    type="button"
                    className="cal-month-nav-btn"
                    onClick={() => setCalViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    title="Previous month"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="cal-current-month-label">
                    {calViewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    className="cal-month-nav-btn"
                    onClick={() => setCalViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    title="Next month"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Weekday headers */}
                <div className="cal-weekdays-row">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(wd => (
                    <span key={wd} className="cal-weekday-chip">{wd}</span>
                  ))}
                </div>

                {/* Day Grid */}
                <div className="cal-days-grid">
                  {calendarDaysList.map((cell, cIdx) => {
                    if (!cell.dayNum) {
                      return <span key={cIdx} className="cal-day-cell empty-cell" />;
                    }
                    const isSelected = cell.iso === selectedAttDate;
                    const isToday = cell.iso === getTodayIso();
                    return (
                      <button
                        key={cIdx}
                        type="button"
                        className={`cal-day-cell ${isSelected ? 'active-selected' : ''} ${isToday ? 'today-cell' : ''}`}
                        onClick={() => {
                          setSelectedAttDate(cell.iso);
                          setShowDateDropdown(false);
                        }}
                        title={`${cell.iso}${cell.hasData ? ' (Records found in DB)' : ''}`}
                      >
                        <span className="cal-day-num">{cell.dayNum}</span>
                        {cell.hasData && <span className="cal-has-records-dot" />}
                      </button>
                    );
                  })}
                </div>

                {/* Presets and Controls Footer */}
                <div className="cal-popover-footer">
                  <div className="cal-quick-picks">
                    <button
                      type="button"
                      className="cal-preset-btn"
                      onClick={() => {
                        setSelectedAttDate(getTodayIso());
                        setCalViewDate(new Date());
                        setShowDateDropdown(false);
                      }}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="cal-preset-btn"
                      onClick={() => {
                        setSelectedAttDate(getYesterdayIso());
                        setCalViewDate(new Date());
                        setShowDateDropdown(false);
                      }}
                    >
                      Yesterday
                    </button>
                  </div>
                  <button
                    type="button"
                    className="cal-done-btn"
                    onClick={() => setShowDateDropdown(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="staff-action-pill-btn"
            onClick={() => {
              const csv = "Full Name,Role,Station,Status\n" +
                staff.map((s: any) => `"${s.full_name || ''}","${s.role || ''}","${s.station || ''}","${s.status || 'Active'}"`).join("\n");
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `Staff_Directory_${new Date().toISOString().split('T')[0]}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              if (setNotice) setNotice({ text: 'Staff roster exported to CSV.', kind: 'success' });
            }}
          >
            <Download size={14} /> <span>Export</span>
          </button>

          {/* "+ Add Employee" button only on staff tab for Admin */}
          {isAdmin && activeTab === 'staff' && (
            <button
              type="button"
              className="staff-btn-add-primary"
              onClick={() => setShowAddStaffModal(true)}
            >
              <Plus size={16} /> <span>Add Employee</span>
            </button>
          )}

          {/* "+ Add Attendance" button on attendance tab (matching user reference mockup) */}
          {isAdmin && activeTab === 'attendance' && (
            <button
              type="button"
              className="staff-btn-add-primary"
              onClick={() => {
                setManualDate(selectedAttDate);
                if (staff.length > 0 && !manualStaffId) {
                  setManualStaffId(staff[0].id);
                }
                setShowAddAttendanceModal(true);
              }}
            >
              <Plus size={16} /> <span>Add Attendance</span>
            </button>
          )}

          {/* "+ New Leave Request" button only for staff/waiters, NOT for admin */}
          {!isAdmin && activeTab === 'leaves' && (
            <button
              type="button"
              className="staff-btn-add-primary"
              onClick={() => setShowNewLeaveModal(true)}
            >
              <Plus size={16} /> <span>New Leave Request</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Staff Modal */}
      {showAddStaffModal && (
        <div className="simple-modal-backdrop" onClick={() => setShowAddStaffModal(false)}>
          <div className="simple-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-top-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff7ed', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserPlus size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e0c04' }}>Add New Restaurant Staff</h3>
              </div>
              <button
                type="button"
                className="close-modal-icon-btn"
                onClick={() => setShowAddStaffModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7a5440', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group-modal">
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3b1b10', marginBottom: 6 }}>
                  Full Name <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={newStaffName}
                  onChange={e => setNewStaffName(e.target.value)}
                  placeholder="e.g. Anandha Kumar"
                  required
                  style={{ width: '100%', height: 44, borderRadius: 12, border: '1.5px solid #ded0c3', padding: '0 14px', fontSize: 14, outline: 'none' }}
                />
              </div>

              <div className="form-group-modal">
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3b1b10', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={newStaffEmail}
                  onChange={e => setNewStaffEmail(e.target.value)}
                  placeholder="e.g. anand@servora.com"
                  style={{ width: '100%', height: 44, borderRadius: 12, border: '1.5px solid #ded0c3', padding: '0 14px', fontSize: 14, outline: 'none' }}
                />
              </div>

              <div className="form-group-modal">
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3b1b10', marginBottom: 6 }}>
                  Phone Number <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="tel"
                  value={newStaffPhone}
                  onChange={e => setNewStaffPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  required
                  style={{ width: '100%', height: 44, borderRadius: 12, border: '1.5px solid #ded0c3', padding: '0 14px', fontSize: 14, outline: 'none' }}
                />
              </div>

              <div className="form-group-modal">
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3b1b10', marginBottom: 6 }}>
                  Staff Role <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  value={newStaffRole}
                  onChange={e => setNewStaffRole(e.target.value)}
                  style={{ width: '100%', height: 44, borderRadius: 12, border: '1.5px solid #ded0c3', padding: '0 14px', fontSize: 14, outline: 'none', background: '#fff' }}
                >
                  <option value="admin">Head Chef / Admin</option>
                  <option value="kitchen">Cook / Kitchen Staff</option>
                  <option value="employee">Service Staff / Waiter</option>
                </select>
              </div>

              <div className="modal-actions-row" style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="submit"
                  className="primary-modal-btn"
                  disabled={savingStaff}
                  style={{ flex: 1, height: 46, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #d35400 0%, #ea580c 100%)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  {savingStaff ? 'Saving...' : 'Add Staff Member'}
                </button>
                <button
                  type="button"
                  className="cancel-modal-btn"
                  onClick={() => setShowAddStaffModal(false)}
                  style={{ height: 46, padding: '0 18px', borderRadius: 12, border: '1.5px solid #ded0c3', background: '#fff', color: '#5c3321', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Leave Modal with Comment */}
      {showRejectModal && (
        <div className="simple-modal-backdrop">
          <div className="simple-modal-card">
            <h3>Reject Leave Request</h3>
            <p style={{ fontSize: 13, color: '#7a5440', margin: '4px 0 14px' }}>
              Add a reason comment so <b>{selectedLeave?.staff_name}</b> knows why the request was declined:
            </p>
            <textarea
              rows={3}
              className="form-textarea"
              placeholder="e.g., Weekend peak hours requires all staff on duty. Please reschedule for weekday."
              value={rejectionComment}
              onChange={e => setRejectionComment(e.target.value)}
              required
            />
            <div className="modal-actions-row" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="primary-modal-btn"
                style={{ background: '#dc2626' }}
                disabled={!rejectionComment.trim() || updatingLeave}
                onClick={handleConfirmRejectLeave}
              >
                {updatingLeave ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
              <button
                type="button"
                className="cancel-modal-btn"
                onClick={() => setShowRejectModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Submit Leave Modal */}
      {showNewLeaveModal && (
        <div className="simple-modal-backdrop">
          <div className="simple-modal-card">
            <h3>Submit Leave Request</h3>
            <form onSubmit={handleStaffSubmitLeave}>
              <div className="form-group-modal">
                <label>Leave Type *</label>
                <select value={newLeaveType} onChange={e => setNewLeaveType(e.target.value)}>
                  <option value="Casual">Casual Leave</option>
                  <option value="Medical">Medical Leave</option>
                  <option value="Earned">Earned / Annual Leave</option>
                </select>
              </div>
              <div className="form-group-modal">
                <label>Start Date *</label>
                <input
                  type="date"
                  value={newLeaveStart}
                  onChange={e => setNewLeaveStart(e.target.value)}
                  required
                />
              </div>
              <div className="form-group-modal">
                <label>End Date</label>
                <input
                  type="date"
                  value={newLeaveEnd}
                  onChange={e => setNewLeaveEnd(e.target.value)}
                />
              </div>
              <div className="form-group-modal">
                <label>Reason *</label>
                <textarea
                  rows={2}
                  value={newLeaveReason}
                  onChange={e => setNewLeaveReason(e.target.value)}
                  placeholder="State the reason for leave..."
                  required
                />
              </div>
              <div className="modal-actions-row">
                <button type="submit" className="primary-modal-btn">Submit Request</button>
                <button type="button" className="cancel-modal-btn" onClick={() => setShowNewLeaveModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendance Record Details Modal (for staff/waiter and admin click-view) */}
      {showAttDetailsModal && selectedAttMember && (
        <div className="simple-modal-backdrop" onClick={() => setShowAttDetailsModal(false)}>
          <div className="simple-modal-card att-details-modal" onClick={e => e.stopPropagation()}>
            <div className="att-modal-header">
              <div className="att-modal-title-col">
                <h3>{selectedAttMember.member?.full_name}</h3>
                <span className={`role-pill-badge ${getRoleBadgeClass(selectedAttMember.roleTitle)}`}>
                  {selectedAttMember.roleTitle || 'Service Staff'}
                </span>
              </div>
              <button type="button" className="close-modal-icon-btn" onClick={() => setShowAttDetailsModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="att-modal-body">
              <div className="att-status-badge-hero">
                <span className={`staff-status-pill ${selectedAttMember.statusTone} large`}>
                  <span className="dot" /> {selectedAttMember.statusText}
                </span>
                <span className="att-date-tag">
                  {formatDateDisplay(selectedAttDate)}
                </span>
              </div>

              <div className="att-info-grid">
                <div className="att-info-item">
                  <span className="info-label"><Clock size={13} /> Check-In Time</span>
                  <b className="info-val">{selectedAttMember.checkIn}</b>
                </div>
                <div className="att-info-item">
                  <span className="info-label"><Clock3 size={13} /> Check-Out Time</span>
                  <b className="info-val">{selectedAttMember.checkOut}</b>
                </div>
                <div className="att-info-item">
                  <span className="info-label"><UserCheck size={13} /> Total Hours</span>
                  <b className="info-val">{selectedAttMember.workHours || selectedAttMember.hours || '--'}</b>
                </div>
                <div className="att-info-item">
                  <span className="info-label"><QrCode size={13} /> Verification</span>
                  <b className="info-val" style={{ color: '#059669' }}>
                    {selectedAttMember.attRecord?.verification_method === 'admin_adjustment' ? 'Admin Adjusted' : 'Dual QR Verified (8-Char)'}
                  </b>
                </div>
                <div className="att-info-item">
                  <span className="info-label"><Phone size={13} /> Phone Number</span>
                  <b className="info-val">{selectedAttMember.member?.phone || '+91 98765 43210'}</b>
                </div>
                <div className="att-info-item">
                  <span className="info-label"><Mail size={13} /> Email</span>
                  <b className="info-val">{selectedAttMember.member?.email || `${selectedAttMember.member?.full_name?.toLowerCase().replace(/\s+/g, '')}@servora.com`}</b>
                </div>
              </div>
            </div>

            <div className="modal-actions-row">
              <button
                type="button"
                className="secondary-modal-btn"
                onClick={() => {
                  setManualStaffId(selectedAttMember.member?.id);
                  setManualDate(selectedAttDate);
                  setManualStatus(selectedAttMember.isPresent ? 'present' : selectedAttMember.isLate ? 'late' : 'absent');
                  setShowAttDetailsModal(false);
                  setShowAddAttendanceModal(true);
                }}
              >
                <Edit2 size={13} /> Adjust Record
              </button>
              <button type="button" className="primary-modal-btn" onClick={() => setShowAttDetailsModal(false)}>
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Adjust Attendance Modal */}
      {showAddAttendanceModal && (
        <div className="simple-modal-backdrop" onClick={() => setShowAddAttendanceModal(false)}>
          <div className="simple-modal-card add-attendance-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-top-header">
              <h3>Add / Adjust Staff Attendance</h3>
              <button type="button" className="close-modal-icon-btn" onClick={() => setShowAddAttendanceModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveAttendance}>
              <div className="form-group-modal">
                <label>Staff Member *</label>
                <select
                  value={manualStaffId}
                  onChange={e => setManualStaffId(e.target.value)}
                  className="modal-select-field"
                  required
                >
                  <option value="">-- Choose Staff Member --</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({getStaffRoleTitle(s)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row-2col">
                <div className="form-group-modal">
                  <label>Attendance Date *</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={e => setManualDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group-modal">
                  <label>Status *</label>
                  <select
                    value={manualStatus}
                    onChange={e => setManualStatus(e.target.value as any)}
                    className="modal-select-field"
                  >
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>
              </div>

              {manualStatus !== 'absent' && (
                <div className="form-row-2col">
                  <div className="form-group-modal">
                    <label>Check-in Time</label>
                    <input
                      type="time"
                      value={manualCheckIn}
                      onChange={e => setManualCheckIn(e.target.value)}
                    />
                  </div>
                  <div className="form-group-modal">
                    <label>Check-out Time</label>
                    <input
                      type="time"
                      value={manualCheckOut}
                      onChange={e => setManualCheckOut(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="modal-actions-row">
                <button type="submit" className="primary-modal-btn" disabled={savingManualAtt}>
                  {savingManualAtt ? 'Saving Record...' : 'Save Attendance Record'}
                </button>
                <button type="button" className="cancel-modal-btn" onClick={() => setShowAddAttendanceModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View All Attendance Logs Modal */}
      {showAllLogsModal && (
        <div className="simple-modal-backdrop" onClick={() => setShowAllLogsModal(false)}>
          <div className="simple-modal-card all-logs-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-top-header">
              <h3>All Recent Attendance Logs ({allLogsFromDb.length})</h3>
              <button type="button" className="close-modal-icon-btn" onClick={() => setShowAllLogsModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="all-logs-table-wrap">
              <table className="staff-data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Staff Name</th>
                    <th>Role</th>
                    <th>Date</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th>Status</th>
                    <th>Method</th>
                  </tr>
                </thead>
                <tbody>
                  {allLogsFromDb.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-table-cell">No logs available.</td>
                    </tr>
                  ) : (
                    allLogsFromDb.map((rec, idx) => {
                      const m = staff.find(s => s.id === rec.employee_id) || rec.profiles;
                      const role = getStaffRoleTitle(m);
                      return (
                        <tr key={rec.id || idx}>
                          <td className="row-num">{idx + 1}</td>
                          <td className="member-name-cell">
                            <b className="name-text">{m?.full_name || 'Staff Member'}</b>
                          </td>
                          <td>
                            <span className={`role-chip ${getRoleBadgeClass(role)}`}>{role}</span>
                          </td>
                          <td>{formatDateDisplay(rec.work_date)}</td>
                          <td>{formatTimeDisplay(rec.check_in)}</td>
                          <td>{formatTimeDisplay(rec.check_out)}</td>
                          <td>
                            <span className={`staff-status-pill tone-${rec.status}`}>
                              <span className="dot" /> {rec.status}
                            </span>
                          </td>
                          <td>{rec.verification_method || 'qr'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="modal-actions-row">
              <button type="button" className="primary-modal-btn" onClick={() => setShowAllLogsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 1: EMPLOYEE MANAGEMENT (KITCHEN & WAITER ONLY)
          ======================================================== */}
      {activeTab === 'staff' && (
        <div className="staff-tab-content-wrap">
          {/* Top 4 Stats */}
          <div className="staff-metrics-cards-row">
            <div className="staff-stat-card stat-total-staff">
              <div className="stat-card-left">
                <span className="stat-label">Total Employees</span>
                <b className="stat-val">{totalStaffCount}</b>
              </div>
              <span className="stat-icon-box icon-wood"><Users size={22} /></span>
            </div>

            <div className="staff-stat-card stat-present">
              <div className="stat-card-left">
                <span className="stat-label">Floor Waiters</span>
                <b className="stat-val">{employeeList.filter(e => e.role === 'employee').length}</b>
              </div>
              <span className="stat-icon-box icon-green"><UserCheck size={22} /></span>
            </div>

            <div className="staff-stat-card stat-late">
              <div className="stat-card-left">
                <span className="stat-label">Kitchen &amp; Cooks</span>
                <b className="stat-val">{employeeList.filter(e => e.role === 'kitchen').length}</b>
              </div>
              <span className="stat-icon-box icon-yellow"><Clock3 size={22} /></span>
            </div>

            <div className="staff-stat-card stat-rate">
              <div className="stat-card-left">
                <span className="stat-label">Total Shifts</span>
                <b className="stat-val">2 Shifts</b>
              </div>
              <span className="stat-icon-box icon-rate"><Calendar size={22} /></span>
            </div>
          </div>

          {/* Employee List Table */}
          <div className="staff-list-full-panel">
            <div className="staff-list-toolbar">
              <div className="toolbar-left">
                <h3 className="section-title">
                  Employee Directory <span className="count-badge">({filteredStaff.length})</span>
                </h3>
              </div>

              <div className="toolbar-right">
                <div className="filter-dropdown-wrap">
                  <select
                    className="filter-select"
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                  >
                    <option value="all">All Employees</option>
                    <option value="kitchen">Cook / Kitchen Employee</option>
                    <option value="employee">Floor Waiter</option>
                  </select>
                </div>

                <div className="staff-search-box">
                  <Search size={15} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search employee (name, role, phone)..."
                    value={searchStaff}
                    onChange={e => setSearchStaff(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>
            </div>

            <div className="staff-table-wrap">
              <table className="staff-data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Employee Name</th>
                    <th>Role</th>
                    <th>Email Address</th>
                    <th>Phone Number</th>
                    <th>Assigned Shift</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-table-cell">No employees found.</td>
                    </tr>
                  ) : (
                    filteredStaff.map((member, idx) => {
                      const roleTitle = member.role === 'kitchen'
                        ? 'Cook / Kitchen Staff'
                        : 'Floor Waiter';

                      const roleClass = member.role === 'kitchen'
                        ? 'role-cook'
                        : 'role-steward';

                      const shiftType = idx % 2 === 0 ? 'Morning Shift' : 'Evening Shift';

                      return (
                        <tr key={member.id || idx}>
                          <td className="row-num">{idx + 1}</td>
                          <td className="member-name-cell">
                            <div className="member-avatar-circle">
                              {(member.full_name || 'Staff').slice(0, 1)}
                            </div>
                            <b className="name-text">{member.full_name || 'Staff Member'}</b>
                          </td>
                          <td>
                            <span className={`role-pill-badge ${roleClass}`}>{roleTitle}</span>
                          </td>
                          <td className="email-cell">{member.email || `${member.full_name?.toLowerCase().replace(/\s+/g, '')}@servora.com`}</td>
                          <td className="phone-cell">
                            <Phone size={13} className="phone-icon" /> {member.phone || '+91 98765 43210'}
                          </td>
                          <td>
                            <span className={`shift-badge-pill ${idx % 2 === 0 ? 'morning' : 'evening'}`}>
                              {idx % 2 === 0 ? <Sun size={12} /> : <Moon size={12} />} {shiftType}
                            </span>
                          </td>
                          <td className="actions-cell">
                            <button
                              type="button"
                              className="row-tool-btn"
                              title="Edit staff details"
                              onClick={() => {
                                if (setNotice) setNotice({ text: `Editing ${member.full_name}`, kind: 'info' });
                              }}
                            >
                              <Edit2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 2: ATTENDANCE (MATCHING REFERENCE MOCKUP SCREENSHOT 1)
          ======================================================== */}
      {activeTab === 'attendance' && (
        <div className="attendance-tab-content-wrap">
          {/* Main Attendance Split Layout (Left: Stats + Daily Table; Right: Dual QR + 2 Side-by-Side Charts + Recent Logs) */}
          <div className="attendance-main-split-layout">
            {/* LEFT COLUMN */}
            <div className="attendance-left-column">
              {/* 4 Stat Cards at the Top of Left Column */}
              <div className="attendance-stat-cards-row">
                {/* 1. Total Staff */}
                <div className="att-stat-card stat-total-staff">
                  <span className="att-stat-icon-box icon-wood"><Users size={22} /></span>
                  <div className="att-stat-content">
                    <span className="att-stat-label">Total Staff</span>
                    <b className="att-stat-val">{totalStaffCount}</b>
                  </div>
                </div>

                {/* 2. Present */}
                <div className="att-stat-card stat-present">
                  <span className="att-stat-icon-box icon-green"><CheckCircle2 size={22} /></span>
                  <div className="att-stat-content">
                    <span className="att-stat-label">Present</span>
                    <b className="att-stat-val">{todayPresentCount}</b>
                  </div>
                </div>

                {/* 3. Late */}
                <div className="att-stat-card stat-late">
                  <span className="att-stat-icon-box icon-yellow"><Clock3 size={22} /></span>
                  <div className="att-stat-content">
                    <span className="att-stat-label">Late</span>
                    <b className="att-stat-val">{todayLateCount}</b>
                  </div>
                </div>

                {/* 4. Absent with Attendance Rate & Trend */}
                <div className="att-stat-card stat-absent">
                  <span className="att-stat-icon-box icon-red"><X size={22} /></span>
                  <div className="att-stat-content">
                    <span className="att-stat-label">Absent</span>
                    <b className="att-stat-val">{todayAbsentCount}</b>
                    <div className="att-rate-trend-subline">
                      <span className="rate-caption">Attendance Rate</span>
                      <b className="rate-num">{todayAttendanceRate}%</b>
                      <span className="rate-trend-tag">+5%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Daily Attendance Table Panel */}
              <div className="daily-attendance-panel">
                <div className="panel-header-with-filters">
                  <div className="panel-title-group">
                    <Calendar size={18} className="panel-icon orange" />
                    <h3 className="panel-title">
                      Daily Attendance – {formatDateDisplay(selectedAttDate)}
                    </h3>
                  </div>

                  <div className="att-header-filters-row">
                    <select
                      className="filter-select att-filter-pill"
                      value={attRoleFilter}
                      onChange={e => {
                        setAttRoleFilter(e.target.value);
                        setAttPage(1);
                      }}
                    >
                      <option value="all">All Roles</option>
                      <option value="Head Chef">Head Chef</option>
                      <option value="Cook">Cook</option>
                      <option value="Kitchen Helper">Kitchen Helper</option>
                      <option value="Service Staff">Service Staff</option>
                      <option value="Cashier">Cashier</option>
                      <option value="Steward">Steward</option>
                      <option value="Maintenance">Maintenance</option>
                    </select>

                    <select
                      className="filter-select att-filter-pill"
                      value={attStatusFilter}
                      onChange={e => {
                        setAttStatusFilter(e.target.value);
                        setAttPage(1);
                      }}
                    >
                      <option value="all">All Status</option>
                      <option value="Present">Present</option>
                      <option value="Late">Late</option>
                      <option value="Absent">Absent</option>
                    </select>
                  </div>
                </div>

                <div className="attendance-data-table-wrap">
                  <table className="staff-data-table att-daily-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>#</th>
                        <th>Staff Name</th>
                        <th>Role</th>
                        <th>Check-in</th>
                        <th>Check-out</th>
                        <th>Work Hours</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDailyStaff.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty-table-cell">No staff attendance records for this filter.</td>
                        </tr>
                      ) : (
                        paginatedDailyStaff.map((item, idx) => {
                          const rowNum = (attPage - 1) * attRowsPerPage + idx + 1;
                          return (
                            <tr
                              key={item.member.id || idx}
                              className="clickable-attendance-row"
                              onClick={() => {
                                setSelectedAttMember(item);
                                setShowAttDetailsModal(true);
                              }}
                              title="Click to view full attendance report"
                            >
                              <td className="row-num">{rowNum}</td>
                              <td className="member-name-cell">
                                <b className="name-text">{item.member.full_name || 'Staff Member'}</b>
                              </td>
                              <td>
                                <span className={`role-chip ${getRoleBadgeClass(item.roleTitle)}`}>
                                  {item.roleTitle}
                                </span>
                              </td>
                              <td>
                                {item.checkIn !== '--' ? (
                                  <span className={`time-chip ${item.isLate ? 'time-chip-late' : 'time-chip-normal'}`}>
                                    {item.checkIn}
                                  </span>
                                ) : (
                                  <span className="time-dash">--</span>
                                )}
                              </td>
                              <td>
                                {item.checkOut !== '--' ? (
                                  <span className="time-chip time-chip-normal">
                                    {item.checkOut}
                                  </span>
                                ) : (
                                  <span className="time-dash">--</span>
                                )}
                              </td>
                              <td className="hours-worked-cell">
                                <span className={item.workHours !== '--' ? 'hours-val-bold' : 'time-dash'}>
                                  {item.workHours}
                                </span>
                              </td>
                              <td>
                                <span className={`staff-status-pill ${item.statusTone}`}>
                                  <span className="dot" /> {item.statusText}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table Pagination Footer */}
                <div className="att-table-pagination-footer">
                  <div className="pagination-info">
                    Showing {filteredDailyStaff.length === 0 ? 0 : (attPage - 1) * attRowsPerPage + 1} – {Math.min(attPage * attRowsPerPage, filteredDailyStaff.length)} of {filteredDailyStaff.length} staff
                  </div>

                  <div className="pagination-controls">
                    <button
                      type="button"
                      className="page-nav-btn"
                      disabled={attPage <= 1}
                      onClick={() => setAttPage(prev => Math.max(1, prev - 1))}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: totalAttPages }, (_, i) => i + 1).map(pageNum => (
                      <button
                        key={pageNum}
                        type="button"
                        className={`page-num-btn ${attPage === pageNum ? 'active' : ''}`}
                        onClick={() => setAttPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="page-nav-btn"
                      disabled={attPage >= totalAttPages}
                      onClick={() => setAttPage(prev => Math.min(totalAttPages, prev + 1))}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="rows-per-page-selector">
                    <span>Rows per page:</span>
                    <select
                      value={attRowsPerPage}
                      onChange={e => {
                        setAttRowsPerPage(Number(e.target.value));
                        setAttPage(1);
                      }}
                      className="rows-select"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="attendance-qr-hub-side-panel">
              {/* Dual QR Box (Check-In & Check-Out) */}
              <div className="attendance-qr-card-box">
                <div className="qr-box-header">
                  <QrCode size={18} className="panel-icon orange" />
                  <h4 className="qr-box-title">Attendance QR (Check-in / Check-out)</h4>
                </div>

                <div className="dual-qr-code-grid">
                  {/* 1. Check-In QR */}
                  <div className="qr-tile tile-checkin">
                    <div className="qr-tile-badge badge-checkin">
                      <span className="arrow-sym"></span> Check-in QR
                    </div>
                    <div className="qr-img-frame">
                      {checkInQrUrl ? (
                        <img src={checkInQrUrl} alt="Check In QR" className="qr-code-canvas-img" />
                      ) : (
                        <div className="qr-code-canvas-img skeleton" />
                      )}
                    </div>
                    <div className="qr-code-value-box checkin-code-box">
                      <span className="code-label">Code</span>
                      <b className="code-value">{checkInCode}</b>
                    </div>
                    <span className="code-validity-text">
                      Valid Today ({formatDateDisplay(selectedAttDate).split(',')[1]?.trim() || selectedAttDate})
                    </span>
                    <button
                      type="button"
                      className="qr-download-pill-btn"
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = checkInQrUrl;
                        a.download = `Servora_CheckIn_QR_${checkInCode}.png`;
                        a.click();
                      }}
                    >
                      <Download size={13} /> Download
                    </button>
                  </div>

                  {/* 2. Check-Out QR */}
                  <div className="qr-tile tile-checkout">
                    <div className="qr-tile-badge badge-checkout">
                      <span className="arrow-sym"></span> Check-out QR
                    </div>
                    <div className="qr-img-frame">
                      {checkOutQrUrl ? (
                        <img src={checkOutQrUrl} alt="Check Out QR" className="qr-code-canvas-img" />
                      ) : (
                        <div className="qr-code-canvas-img skeleton" />
                      )}
                    </div>
                    <div className="qr-code-value-box checkout-code-box">
                      <span className="code-label">Code</span>
                      <b className="code-value">{checkOutCode}</b>
                    </div>
                    <span className="code-validity-text">
                      Valid Today ({formatDateDisplay(selectedAttDate).split(',')[1]?.trim() || selectedAttDate})
                    </span>
                    <button
                      type="button"
                      className="qr-download-pill-btn"
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = checkOutQrUrl;
                        a.download = `Servora_CheckOut_QR_${checkOutCode}.png`;
                        a.click();
                      }}
                    >
                      <Download size={13} /> Download
                    </button>
                  </div>
                </div>

                {/* QR Settings Row */}
                <div className="qr-settings-controls-row">
                  <div className="qr-control-item">
                    <span className="control-label">Validity</span>
                    <select className="control-select" defaultValue="today">
                      <option value="today">Today Only</option>
                      <option value="week">1 Week</option>
                      <option value="month">1 Month</option>
                    </select>
                  </div>

                  <div className="qr-control-item">
                    <span className="control-label">Auto Attendance</span>
                    <label className="servora-toggle-switch mini">
                      <input type="checkbox" defaultChecked />
                      <span className="slider round" />
                    </label>
                  </div>

                  <div className="qr-control-item">
                    <span className="control-label">Refresh Daily</span>
                    <label className="servora-toggle-switch mini">
                      <input type="checkbox" defaultChecked />
                      <span className="slider round" />
                    </label>
                  </div>

                  <button
                    type="button"
                    className="qr-regenerate-btn"
                    onClick={handleRegenerateCodes}
                    title="Generate new 8-character codes"
                  >
                    <RefreshCw size={12} /> <span>Regenerate QR</span>
                  </button>
                </div>
              </div>

              {/* Attendance Overview + 7-Day Trend Row (Side-by-Side) */}
              <div className="attendance-charts-double-row">
                {/* 1. Attendance Overview Donut Chart */}
                <div className="overview-donut-box">
                  <h4 className="chart-box-title">Attendance Overview</h4>
                  <div className="donut-and-legend-split">
                    <div className="donut-svg-wrapper">
                      <svg viewBox="0 0 100 100" className="donut-svg-ring">
                        {/* Background track circle */}
                        <circle
                          cx="50"
                          cy="50"
                          r={donutRadius}
                          fill="transparent"
                          stroke="#f3ebe3"
                          strokeWidth="11"
                        />
                        {/* Dynamic Attendance rate ring */}
                        <circle
                          cx="50"
                          cy="50"
                          r={donutRadius}
                          fill="transparent"
                          stroke="#16a34a"
                          strokeWidth="11"
                          strokeDasharray={donutCircumference}
                          strokeDashoffset={donutDashOffset}
                          strokeLinecap="round"
                          transform="rotate(-90 50 50)"
                          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                        />
                      </svg>
                      <div className="donut-center-content">
                        <span className="donut-rate-num">{todayAttendanceRate}%</span>
                        <span className="donut-rate-label">Present</span>
                      </div>
                    </div>

                    <div className="mini-legend-col">
                      <div className="legend-row">
                        <span className="legend-indicator dot-green" /> Present <b>{todayPresentCount}</b>
                      </div>
                      <div className="legend-row">
                        <span className="legend-indicator dot-yellow" /> Late <b>{todayLateCount}</b>
                      </div>
                      <div className="legend-row">
                        <span className="legend-indicator dot-red" /> Absent <b>{todayAbsentCount}</b>
                      </div>
                      <div className="legend-row total">
                        Total Staff <b>{totalStaffCount}</b>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Attendance Trend (Last 7 Days) Line Chart */}
                <div className="trend-line-chart-box">
                  <div className="chart-box-header">
                    <div className="chart-title-with-icon">
                      <TrendingUp size={15} className="chart-head-icon" />
                      <h4 className="chart-box-title">Attendance Trend (Last 7 Days)</h4>
                    </div>
                    <span className="active-rate-badge">{todayAttendanceRate}%</span>
                  </div>

                  <div className="trend-chart-body-wrap">
                    <div className="trend-svg-container">
                      <svg viewBox="0 0 260 75" className="trend-svg" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="attTrendGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Y-axis horizontal grid lines and level labels */}
                        {[
                          { val: '100%', y: 10 },
                          { val: '80%', y: 20.8 },
                          { val: '60%', y: 31.6 },
                          { val: '40%', y: 42.4 },
                          { val: '20%', y: 53.2 },
                          { val: '0%', y: 64 }
                        ].map((grid, gIdx) => (
                          <g key={gIdx} className="trend-grid-line-group">
                            <text x="30" y={grid.y + 3.5} textAnchor="end" className="trend-y-axis-label">
                              {grid.val}
                            </text>
                            <line
                              x1="36"
                              y1={grid.y}
                              x2="246"
                              y2={grid.y}
                              stroke="#ebd9c8"
                              strokeWidth="0.8"
                              strokeDasharray="2 3"
                            />
                          </g>
                        ))}

                        {/* Area gradient under trend curve */}
                        <polygon
                          points={trendAreaStr}
                          fill="url(#attTrendGradient)"
                        />

                        {/* Trend Line */}
                        <polyline
                          fill="none"
                          stroke="#16a34a"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={trendPolylineStr}
                        />

                        {/* Data dots with tooltip trigger */}
                        {trendPoints.map((pt, pIdx) => (
                          <g
                            key={pIdx}
                            onMouseEnter={() => setHoveredTrendIdx(pIdx)}
                            onMouseLeave={() => setHoveredTrendIdx(null)}
                            style={{ cursor: 'pointer' }}
                          >
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={hoveredTrendIdx === pIdx ? 5.5 : 3.5}
                              fill="#16a34a"
                              stroke="#ffffff"
                              strokeWidth="1.8"
                              style={{ transition: 'all 0.2s ease' }}
                            />
                          </g>
                        ))}
                      </svg>

                      {/* Hover Tooltip Overlay */}
                      {hoveredTrendIdx !== null && trendPoints[hoveredTrendIdx] && (
                        <div
                          className="trend-point-tooltip"
                          style={{
                            left: `${(trendPoints[hoveredTrendIdx].x / 260) * 100}%`,
                            top: `${(trendPoints[hoveredTrendIdx].y / 75) * 100}%`
                          }}
                        >
                          <b className="tip-rate">{trendPoints[hoveredTrendIdx].rate}%</b>
                          <span className="tip-sub">
                            {trendPoints[hoveredTrendIdx].present}/{trendPoints[hoveredTrendIdx].total} Staff ({trendPoints[hoveredTrendIdx].dayLabel})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom X-axis Dates */}
                    <div className="trend-x-axis-row">
                      {trendDays.map((d, dIdx) => (
                        <span key={dIdx} className={`trend-day-chip ${d.isoDate === selectedAttDate ? 'current' : ''}`}>
                          {d.dayLabel}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Attendance Logs list */}
              <div className="recent-attendance-logs-box">
                <div className="box-header-row">
                  <h4 className="box-title">Recent Attendance Logs</h4>
                  <button
                    type="button"
                    className="view-all-link-btn"
                    onClick={() => setShowAllLogsModal(true)}
                  >
                    View All
                  </button>
                </div>

                <div className="logs-list-stack">
                  {recentLogs.length === 0 ? (
                    <div className="empty-logs-notice">No recent logs recorded today.</div>
                  ) : (
                    recentLogs.map(log => (
                      <div key={log.id} className="log-item-row">
                        <span className={`log-status-dot ${log.dotColor}`} />
                        <span className="log-staff">{log.name}</span>
                        <span className="log-action">{log.actionDesc}</span>
                        <span className="log-tag">{log.dateLabel}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 3: LEAVE REQUESTS (SCREENSHOT 2 REAL DATABASE DATA)
          ======================================================== */}
      {activeTab === 'leaves' && (
        <div className="leaves-tab-content-wrap">
          {/* Top 4 Metrics Row */}
          <div className="staff-metrics-cards-row">
            <div className="staff-stat-card stat-total-staff">
              <div className="stat-card-left">
                <span className="stat-label">Total Requests</span>
                <b className="stat-val">{totalLeaveRequests}</b>
              </div>
              <span className="stat-icon-box icon-wood"><FileText size={22} /></span>
            </div>

            <div className="staff-stat-card stat-present">
              <div className="stat-card-left">
                <span className="stat-label">Approved</span>
                <b className="stat-val">{approvedLeaves}</b>
              </div>
              <span className="stat-icon-box icon-green"><CheckCircle2 size={22} /></span>
            </div>

            <div className="staff-stat-card stat-late">
              <div className="stat-card-left">
                <span className="stat-label">Pending</span>
                <b className="stat-val">{pendingLeaves}</b>
              </div>
              <span className="stat-icon-box icon-yellow"><Clock3 size={22} /></span>
            </div>

            <div className="staff-stat-card stat-absent">
              <div className="stat-card-left">
                <span className="stat-label">Rejected</span>
                <b className="stat-val">{rejectedLeaves}</b>
              </div>
              <span className="stat-icon-box icon-red"><X size={22} /></span>
            </div>

            <div className="staff-stat-card stat-rate">
              <div className="stat-card-left">
                <span className="stat-label">This Month</span>
                <b className="stat-val" style={{ fontSize: 18 }}>
                  {new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </b>
              </div>
              <span className="stat-icon-box icon-rate"><Calendar size={22} /></span>
            </div>
          </div>

          {/* Main Leaves Split Layout: Requests Table (68%) + Leave Request Details (32%) */}
          <div className="leaves-main-split-layout">
            <div className="leaves-table-panel">
              <div className="leaves-toolbar-row">
                <div className="status-filter-pills-group">
                  {[
                    { key: 'all', label: `All Requests (${totalLeaveRequests})` },
                    { key: 'pending', label: `Pending (${pendingLeaves})` },
                    { key: 'approved', label: `Approved (${approvedLeaves})` },
                    { key: 'rejected', label: `Rejected (${rejectedLeaves})` }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      className={`leave-tab-pill ${leaveStatusFilter === tab.key ? 'active' : ''}`}
                      onClick={() => setLeaveStatusFilter(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="filters-dropdowns-group">
                  <select
                    className="filter-select"
                    value={leaveRoleFilter}
                    onChange={e => setLeaveRoleFilter(e.target.value)}
                  >
                    <option value="all">All Roles</option>
                    <option value="head chef">Head Chef</option>
                    <option value="cook">Cook</option>
                    <option value="kitchen helper">Kitchen Helper</option>
                    <option value="service staff">Service Staff</option>
                    <option value="cashier">Cashier</option>
                  </select>

                  <select
                    className="filter-select"
                    value={leaveTypeFilter}
                    onChange={e => setLeaveTypeFilter(e.target.value)}
                  >
                    <option value="all">All Leave Types</option>
                    <option value="casual">Casual</option>
                    <option value="medical">Medical</option>
                    <option value="earned">Earned</option>
                  </select>
                </div>
              </div>

              <div className="leaves-table-wrapper">
                <table className="staff-data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Staff</th>
                      <th>Role</th>
                      <th>Leave Type</th>
                      <th>Duration</th>
                      <th>Days</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Requested On</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeaves.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="empty-table-cell">No leave requests found.</td>
                      </tr>
                    ) : (
                      filteredLeaves.map((leave, idx) => {
                        const isSelected = selectedLeave?.id === leave.id;
                        const isPending = leave.status === 'pending';
                        const isApproved = leave.status === 'approved';

                        const statusClass = isPending ? 'tone-pending' : isApproved ? 'tone-approved' : 'tone-rejected';
                        const statusLabel = isPending ? 'Pending' : isApproved ? 'Approved' : 'Rejected';

                        return (
                          <tr
                            key={leave.id || idx}
                            className={`leave-data-row ${isSelected ? 'row-selected' : ''}`}
                            onClick={() => setSelectedLeave(leave)}
                          >
                            <td className="row-num">{idx + 1}</td>
                            <td className="member-name-cell">
                              <div className="member-avatar-circle">
                                {(leave.staff_name || 'S').slice(0, 1)}
                              </div>
                              <b className="name-text">{leave.staff_name || 'Staff Member'}</b>
                            </td>
                            <td>
                              <span className="role-chip">{leave.role}</span>
                            </td>
                            <td>
                              <span className={`leave-type-pill type-${(leave.leave_type || '').toLowerCase()}`}>
                                {leave.leave_type || 'Casual'}
                              </span>
                            </td>
                            <td className="duration-cell">{leave.duration || leave.start_date}</td>
                            <td className="days-cell">{leave.days || 1}</td>
                            <td className="reason-cell" title={leave.reason}>{leave.reason}</td>
                            <td>
                              <span className={`leave-status-pill ${statusClass}`}>
                                <span className="dot" /> {statusLabel}
                              </span>
                            </td>
                            <td className="date-cell">
                              {leave.created_at ? new Date(leave.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '22 Nov 2026'}
                            </td>
                            <td className="actions-cell" style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="btn-view-att-pill"
                                title="Click to view full leave details"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLeave(leave);
                                }}
                              >
                                <Eye size={13} /> <span>View</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Details Drawer matching Screenshot 2 */}
            <div className="leave-details-card-panel">
              <div className="panel-header-row">
                <FileText size={17} className="panel-icon orange" />
                <h4 className="panel-title">Leave Request Details</h4>
              </div>

              {!selectedLeave ? (
                <div className="empty-details-notice">Select a leave request to view details.</div>
              ) : (
                <div className="leave-details-body">
                  <div className="staff-profile-banner">
                    <div className="banner-avatar-circle">
                      {(selectedLeave.staff_name || 'S').slice(0, 1)}
                    </div>
                    <div className="banner-info-col">
                      <b className="banner-name">{selectedLeave.staff_name}</b>
                      <span className="banner-role-pill">{selectedLeave.role}</span>
                      <span className="banner-phone">
                        <Phone size={12} /> +91 98765 43210
                      </span>
                    </div>
                  </div>

                  <div className="details-metadata-list">
                    <div className="meta-row">
                      <span className="meta-label">Leave Type</span>
                      <span className="meta-sep">:</span>
                      <b className="meta-val">{selectedLeave.leave_type} Leave</b>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Duration</span>
                      <span className="meta-sep">:</span>
                      <b className="meta-val">{selectedLeave.duration} ({selectedLeave.days} Day{selectedLeave.days > 1 ? 's' : ''})</b>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Reason</span>
                      <span className="meta-sep">:</span>
                      <b className="meta-val">{selectedLeave.reason}</b>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Requested On</span>
                      <span className="meta-sep">:</span>
                      <b className="meta-val">
                        {selectedLeave.created_at ? new Date(selectedLeave.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '22 Nov 2026'}
                      </b>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Status</span>
                      <span className="meta-sep">:</span>
                      <span className={`status-tag-badge ${selectedLeave.status}`}>
                        {selectedLeave.status === 'pending' ? 'Pending' : selectedLeave.status === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                    </div>

                    {/* Admin Rejection Comment if rejected */}
                    {selectedLeave.status === 'rejected' && selectedLeave.rejection_reason && (
                      <div className="rejection-comment-alert-box">
                        <AlertCircle size={16} className="alert-icon" />
                        <div className="comment-text-wrap">
                          <b>Admin Rejection Comment:</b>
                          <p>{selectedLeave.rejection_reason}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Admin Approve / Reject Action Buttons */}
                  {isAdmin && selectedLeave.status === 'pending' && (
                    <div className="leave-action-buttons-grid">
                      <button
                        type="button"
                        className="btn-approve-leave"
                        disabled={updatingLeave}
                        onClick={() => handleApproveLeave(selectedLeave)}
                      >
                        <Check size={16} /> Approve
                      </button>

                      <button
                        type="button"
                        className="btn-reject-leave"
                        disabled={updatingLeave}
                        onClick={() => {
                          setRejectionComment('');
                          setShowRejectModal(true);
                        }}
                      >
                        <X size={16} /> Reject
                      </button>
                    </div>
                  )}

                  {selectedLeave.status === 'approved' && (
                    <div className="leave-status-banner approved">
                      <CheckCircle2 size={16} /> Request Approved
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 4: STAFF & WAITER QR SCANNER & ATTENDANCE MONITOR (STAFF/WAITER ONLY)
          ======================================================== */}
      {activeTab === 'scanner' && !isAdmin && (
        <div className="staff-scanner-monitor-wrap">
          <div className="scanner-split-grid">
            {/* Left Box: Live Scanner & 8-Char Code Terminal */}
            <div className="scanner-terminal-card">
              <div className="terminal-header">
                <Camera size={18} className="panel-icon orange" />
                <h3 className="terminal-title">Staff Attendance Scanner &amp; Check-In</h3>
              </div>

              {/* Staff Selector (if admin testing) */}
              <div className="terminal-staff-select-row">
                <label>Active Staff / Waiter:</label>
                <select
                  value={profile?.id || selectedStaffForScan}
                  onChange={e => setSelectedStaffForScan(e.target.value)}
                  disabled={Boolean(profile?.id && !isAdmin)}
                  className="terminal-select"
                >
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.role === 'admin' ? 'Head Chef' : s.role === 'kitchen' ? 'Cook' : 'Waiter'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Scanner Graphic Frame */}
              <div className={`camera-scanner-viewfinder ${scanningActive ? 'is-active' : ''}`}>
                <div className="viewfinder-corner vf-tl" />
                <div className="viewfinder-corner vf-tr" />
                <div className="viewfinder-corner vf-bl" />
                <div className="viewfinder-corner vf-br" />

                <div className="scanner-laser-line" />

                <div className="viewfinder-center-content">
                  <QrCode size={48} className="scanner-qr-icon" />
                  <span className="scanner-prompt-text">
                    {scanningActive ? 'Scanning Attendance QR...' : 'Point camera at Check-in / Check-out QR'}
                  </span>
                  <button
                    type="button"
                    className="btn-camera-toggle"
                    onClick={() => setScanningActive(!scanningActive)}
                  >
                    <Camera size={14} /> {scanningActive ? 'Stop Scanner' : 'Activate Camera'}
                  </button>
                </div>
              </div>

              {/* 8-Character Code Manual Entry */}
              <div className="terminal-code-entry-box">
                <div className="code-entry-header">
                  <span className="code-entry-title">Or Enter 8-Character Daily Code:</span>
                  <div className="sample-codes-chip">
                    Check-in: <b>{checkInCode}</b> | Check-out: <b>{checkOutCode}</b>
                  </div>
                </div>

                <div className="code-input-group">
                  <input
                    type="text"
                    maxLength={8}
                    value={inputCode}
                    onChange={e => setInputCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 8F3K9D2M"
                    className="eight-char-code-input"
                  />
                  <button
                    type="button"
                    className="btn-fast-paste-code in"
                    onClick={() => setInputCode(checkInCode)}
                    title="Paste today's Check-in Code"
                  >
                    Paste In
                  </button>
                  <button
                    type="button"
                    className="btn-fast-paste-code out"
                    onClick={() => setInputCode(checkOutCode)}
                    title="Paste today's Check-out Code"
                  >
                    Paste Out
                  </button>
                </div>

                {/* Big Action Buttons */}
                <div className="checkin-checkout-actions-row">
                  <button
                    type="button"
                    className="btn-action-checkin"
                    disabled={checkingInOut}
                    onClick={handlePerformCheckIn}
                  >
                    <CheckCircle2 size={18} />
                    <span>Check-In to Shift</span>
                  </button>

                  <button
                    type="button"
                    className="btn-action-checkout"
                    disabled={checkingInOut}
                    onClick={handlePerformCheckOut}
                  >
                    <Clock size={18} />
                    <span>Check-Out from Shift</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Box: Live Attendance Monitor & Shift Details */}
            <div className="staff-attendance-monitor-card">
              <div className="monitor-header">
                <Clock3 size={18} className="panel-icon green" />
                <h3 className="monitor-title">Live Shift &amp; Attendance Monitor</h3>
              </div>

              {/* Live Status Card */}
              <div className="live-status-hero-card">
                <div className="hero-status-top">
                  <span className="live-pulse-indicator" />
                  <span className="hero-status-title">Active Shift Live</span>
                  <span className="hero-role-badge">Service Floor</span>
                </div>
                <div className="hero-time-stats">
                  <div className="time-block">
                    <span className="block-label">Check-in Time</span>
                    <b className="block-val">09:00 AM</b>
                  </div>
                  <div className="time-block">
                    <span className="block-label">Active Time</span>
                    <b className="block-val tone-green">4h 15m</b>
                  </div>
                  <div className="time-block">
                    <span className="block-label">Verification</span>
                    <b className="block-val">QR Code</b>
                  </div>
                </div>
              </div>

              {/* Personal Attendance History Table */}
              <div className="staff-history-section">
                <h4 className="history-title">Recent Shift History</h4>
                <div className="history-table-wrap">
                  <table className="staff-data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Check-in</th>
                        <th>Check-out</th>
                        <th>Hours</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { date: 'Today (22 Nov)', in: '09:00 AM', out: 'Active', hours: '4h 15m', status: 'Present' },
                        { date: '21 Nov 2026', in: '09:02 AM', out: '06:01 PM', hours: '8h 59m', status: 'Present' },
                        { date: '20 Nov 2026', in: '09:00 AM', out: '06:00 PM', hours: '9h 00m', status: 'Present' },
                        { date: '19 Nov 2026', in: '09:15 AM', out: '06:10 PM', hours: '8h 55m', status: 'Late' }
                      ].map((h, i) => (
                        <tr key={i}>
                          <td className="bold-text">{h.date}</td>
                          <td>{h.in}</td>
                          <td>{h.out}</td>
                          <td>{h.hours}</td>
                          <td>
                            <span className={`staff-status-pill ${h.status === 'Present' ? 'tone-present' : 'tone-late'}`}>
                              <span className="dot" /> {h.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quick Link to Submit Leave */}
              <div className="staff-leave-cta-card">
                <div className="cta-left">
                  <b>Planning to take leave?</b>
                  <span>Submit leave request for admin review and check approval status.</span>
                </div>
                <button
                  type="button"
                  className="btn-open-leave-modal"
                  onClick={() => setShowNewLeaveModal(true)}
                >
                  <Plus size={14} /> Request Leave
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
