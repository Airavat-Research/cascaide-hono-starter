
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import {
  LineChart, BarChart, AreaChart, PieChart, LabelList,
  Line, Bar, Area, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts"

// Import new icons for different button states
import { LayoutDashboard, } from "lucide-react";
import { useState } from "react";




const CustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value, name, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const externalRadius = outerRadius * 1.05;
    const tx = cx + externalRadius * Math.cos(-midAngle * RADIAN);
    const ty = cy + externalRadius * Math.sin(-midAngle * RADIAN);

    return (
        <text
            x={tx}
            y={ty}
            fill="#000"
            textAnchor={tx > cx ? 'start' : 'end'}
            dominantBaseline="central"
            fontSize={12}
        >
            {name} ({`${(percent * 100).toFixed(0)}%`})
        </text>
    );
};


export type ChartDisplayProps = {
  chartType: 'line' | 'bar' | 'pie' | 'area' | string;
  title: string;
  data: any; // The array of data objects for recharts
  xAxisKey: string | undefined; // The key in the data objects for the X-axis
  dataKeys: string[]; // The keys in the data objects for the series (lines/bars/slices)
  colors: string[];
  userId: string;
  id: string; // Add the ID from the database
};


export const ChartRenderer = ({ chartProps }: { chartProps: ChartDisplayProps }) => {

  // --- NEW: State to manage the pinning button's status ---
  const [pinState, setPinState] = useState<'idle' | 'loading' | 'saved'>('idle');

  const {
    chartType,
    title,
    data,
    xAxisKey,
    dataKeys,
    colors
  } = chartProps;

  const isDataValid = Array.isArray(data) && data.length > 0 && !!xAxisKey && Array.isArray(dataKeys) && dataKeys.length > 0;



  // Placeholder for invalid data remains the same.
  if (!isDataValid) {
    return (
      <Card className="w-full shadow-lg border-2 border-red-100 min-h-[300px]">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-gray-800">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex-1 flex flex-col items-center justify-center text-yellow-600 text-base p-6">
            <LayoutDashboard className="w-6 h-6 mr-3 text-yello-500" />
            <p className="mt-2">Chart is loading.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // The `renderChart` function remains unchanged.
  const renderChart = () => {
    const commonCartesianProps = {
      data: data,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };
     
    const pieDataKey = dataKeys[0]; 
     
    switch (chartType.toLowerCase()) {
      case 'line':
      case 'bar':
      case 'area':
        // FIX: Explicitly type the component variables
        const ChartComponent: React.ComponentType<any> = 
          chartType.toLowerCase() === 'line' ? LineChart : 
          chartType.toLowerCase() === 'bar' ? BarChart : AreaChart;
        const SeriesComponent: React.ComponentType<any> = 
          chartType.toLowerCase() === 'line' ? Line : 
          chartType.toLowerCase() === 'bar' ? Bar : Area;

        return (
          <ResponsiveContainer width="100%" height={400}>
            <ChartComponent {...commonCartesianProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xAxisKey!} />
              <YAxis />
              <Tooltip />
              <Legend />
              {dataKeys.map((key, index) => (
                <SeriesComponent 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  stroke={chartType.toLowerCase() !== 'bar' ? colors[index % colors.length] : 'none'} 
                  fill={chartType.toLowerCase() === 'bar' || chartType.toLowerCase() === 'area' ? colors[index % colors.length] : undefined}
                  fillOpacity={chartType.toLowerCase() === 'area' ? 0.3 : 1}
                  {...(chartType.toLowerCase() === 'line' ? { activeDot: { r: 8 } } : {})}
                />
              ))}
            </ChartComponent>
          </ResponsiveContainer>
        );
         
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={120} 
                dataKey={pieDataKey}
                nameKey={xAxisKey!} 
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
                <LabelList content={<CustomizedLabel />} />
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );
         
      default:
        return (
          <div className="p-4 text-center">
            <p className="text-red-500 font-semibold">Unsupported chart type: {chartType}</p>
          </div>
        );
    }
  }
   
  return (
    <Card className="w-full shadow-lg border-2 border-blue-100">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl font-bold text-gray-800">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4">
           {renderChart()}
        </div>
      </CardContent>
      
    </Card>
  );
}
