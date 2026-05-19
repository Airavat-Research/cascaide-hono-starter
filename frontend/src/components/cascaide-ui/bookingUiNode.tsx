import { useState} from 'react';


import { useWorkflow } from '@cascaide-ts/react';
import { Spawns } from '@cascaide-ts/core';

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import {
  buildToolResultMessage,
} from '@cascaide-ts/helpers';

export default function BookingUi( { nodeId }: { nodeId: string }) {

const {addActiveNode, signalCompletion, nodeData} = useWorkflow(nodeId);
const cascadeId = nodeData.initialContext.cascadeId;
console.log("nodedata :",JSON.stringify(nodeData,null,2));

  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState('');

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (loading) return; // prevent double submit
    setLoading(true);
    // const history = nodeData.initialContext.history

   
    const toolresponse=buildToolResultMessage('openai-responses', nodeData.initialContext.toolCallsToExecute[0] ,"Booking confirmed, booking id is : azzdfgr146")

        const spawns: Spawns = {
          bookingAgentNode: {
            cascadeId: cascadeId,
            history:[toolresponse],
            // in lite mode, set history: [...history, toolresponse],
            userId: "guest-id",
          }
        };
        await addActiveNode(spawns);


    await signalCompletion(true);

  };

    


  return (
  /* Backdrop Container: Fixed to the full viewport, z-index ensures it stays on top */
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    
    
    <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-2xl transform transition-all scale-100">
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
        Enter PIN
      </h2>
        
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            required
            autoFocus // Automatically focus for better UX
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg shadow-md transition-colors duration-200 flex items-center justify-center"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Processing...
            </span>
          ) : (
            "Submit"
          )}
        </button>
      </form> 
      
      <p className="mt-4 text-xs text-center text-gray-500">
        Please enter your security code to continue.
      </p>
    </div>
  </div>
);
}