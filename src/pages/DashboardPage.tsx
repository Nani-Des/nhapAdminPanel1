import React, { useEffect, useState } from 'react';
import {
  FileText,
  FolderPlus,
  CircleUser,
  FilePlus2,
  Bell,
  RefreshCw,
  Users
} from 'lucide-react';
import { useHospital } from '../contexts/HospitalContext';
import Layout from '../components/layout/Layout';
import ActionCard from '../components/dashboard/ActionCard';
import NotificationPreview from '../components/dashboard/NotificationPreview';
import { db, storage } from '../firebase';
import { collection, documentId, getCountFromServer, query, where } from 'firebase/firestore';
import { ref, listAll } from 'firebase/storage';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const DashboardPage: React.FC = () => {
  const { hospital, notifications } = useHospital();
  const [metrics, setMetrics] = useState({
    totalMedicalRecords: 0,
    totalDepartments: 0,
    totalUsers: 0,
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const departmentIds = hospital?.['Hospital Department'];

        if (!hospital?.id || !departmentIds || departmentIds.length === 0) return;

        const countFilesInStorage = async (folderPath: string): Promise<number> => {
          const folderRef = ref(storage, folderPath);
          const list = await listAll(folderRef);
          return list.items.length;
        };

        const [fileCount, deptSnap, usersSnap] = await Promise.all([
          countFilesInStorage('referral_files'),
          getCountFromServer(
            query(collection(db, 'Department'), where(documentId(), 'in', departmentIds))
          ),
          getCountFromServer(
            query(collection(db, 'Users'), where('Role', '==', true), where('Hospital ID', '==', hospital.id))
          ),
        ]);

        setMetrics({
          totalMedicalRecords: fileCount,
          totalDepartments: deptSnap.data().count,
          totalUsers: usersSnap.data().count,
        });
      } catch (err) {
        console.error('Failed to fetch metrics:', err);
      }
    };

    fetchMetrics();
  }, [hospital]);

  // Mock platform averages for comparison
  const platformAverages = {
    totalMedicalRecords: 75,
    totalDepartments: 15,
    totalUsers: 20,
  };

  // Chart options for bar charts (Medical Records, Departments)
  const barChartOptions = {
    indexAxis: 'y' as const,
    scales: {
      x: { beginAtZero: true, grid: { color: '#ccfbf1' } },
      y: { grid: { display: false } },
    },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0f766e' },
    },
    maintainAspectRatio: false,
  };

  // Chart options for line graph (Doctors)
  const lineChartOptions = {
    scales: {
      x: { grid: { color: '#ccfbf1' } },
      y: { beginAtZero: true, grid: { color: '#ccfbf1' } },
    },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0f766e' },
    },
    maintainAspectRatio: false,
    elements: {
      line: { tension: 0.4, borderWidth: 2 },
      point: { radius: 5, hoverRadius: 7 },
    },
  };

  // Chart data for Medical Records (Bar)
  const medicalRecordsData = {
    labels: ['Your Hospital', 'Platform Average'],
    datasets: [
      {
        label: 'Medical Records',
        data: [metrics.totalMedicalRecords, platformAverages.totalMedicalRecords],
        backgroundColor: ['#0d9488', '#6ee7b7'],
        borderColor: ['#0f766e', '#10b981'],
        borderWidth: 1,
      },
    ],
  };

  // Chart data for Departments (Bar)
  const departmentsData = {
    labels: ['Your Hospital', 'Platform Average'],
    datasets: [
      {
        label: 'Departments',
        data: [metrics.totalDepartments, platformAverages.totalDepartments],
        backgroundColor: ['#0d9488', '#6ee7b7'],
        borderColor: ['#0f766e', '#10b981'],
        borderWidth: 1,
      },
    ],
  };

  // Chart data for Doctors (Line)
  const doctorsData = {
    labels: ['Your Hospital', 'Platform Average'],
    datasets: [
      {
        label: 'Doctors',
        data: [metrics.totalUsers, platformAverages.totalUsers],
        borderColor: '#0d9488',
        backgroundColor: '#0d9488',
        pointBackgroundColor: '#0d9488',
        pointBorderColor: '#0f766e',
        pointHoverBackgroundColor: '#10b981',
        fill: false,
      },
    ],
  };

  return (
    <Layout>
      <div className="space-y-8 bg-teal-50 p-6 rounded-lg">
        {/* Welcome section */}
        <div>
          <h1 className="text-3xl font-bold text-teal-900">
            Welcome to {hospital?.['Hospital Name']} Admin Panel
          </h1>
          <p className="mt-2 text-base text-teal-700">
            Monitor and manage your hospital's operations with real-time insights.
          </p>
        </div>

        {/* Metrics section with charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="bg-teal-100 p-6 rounded-lg shadow-md border border-teal-200">
            <div className="flex items-center mb-4">
              <FileText className="h-6 w-6 text-teal-700" />
              <h3 className="ml-2 text-lg font-semibold text-teal-900">Medical Records</h3>
            </div>
            <div className="h-32">
              <Bar data={medicalRecordsData} options={barChartOptions} />
            </div>
          </div>
          <div className="bg-teal-100 p-6 rounded-lg shadow-md border border-teal-200">
            <div className="flex items-center mb-4">
              <FolderPlus className="h-6 w-6 text-teal-700" />
              <h3 className="ml-2 text-lg font-semibold text-teal-900">Departments</h3>
            </div>
            <div className="h-32">
              <Bar data={departmentsData} options={barChartOptions} />
            </div>
          </div>
          <div className="bg-teal-100 p-6 rounded-lg shadow-md border border-teal-200">
            <div className="flex items-center mb-4">
              <CircleUser className="h-6 w-6 text-teal-700" />
              <h3 className="ml-2 text-lg font-semibold text-teal-900">Doctors</h3>
            </div>
            <div className="h-32">
              <Line data={doctorsData} options={lineChartOptions} />
            </div>
          </div>
        </div>

        {/* Quick actions section */}
        <div>
          <h2 className="text-xl font-semibold text-teal-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <ActionCard
              title="Add Department"
              description="Create a new department in your hospital"
              icon={<FolderPlus className="h-6 w-6 text-white" />}
              path="/departments"
            />
            <ActionCard
              title="Shift Schedule"
              description="Manage doctor shift schedules"
              icon={<Users className="h-6 w-6 text-white" />}
              path="/shift-schedule"
            />
            <ActionCard
              title="View Medical Records"
              description="Access patient medical records"
              icon={<FileText className="h-6 w-6 text-white" />}
              path="/medical-records"
            />
            <ActionCard
              title="Manage Doctors"
              description="Manage doctor profiles"
              icon={<CircleUser className="h-6 w-6 text-white" />}
              path="/doctors"
            />
            <ActionCard
              title="Add Services"
              description="Create new hospital services"
              icon={<FilePlus2 className="h-6 w-6 text-white" />}
              path="/services"
            />
            <ActionCard
              title="View Referrals"
              description="Manage incoming patient referrals"
              icon={<RefreshCw className="h-6 w-6 text-white" />}
              path="/referrals"
            />
          </div>
        </div>

        {/* Notifications preview */}
        <NotificationPreview notifications={notifications} />
      </div>
    </Layout>
  );
};

export default DashboardPage;