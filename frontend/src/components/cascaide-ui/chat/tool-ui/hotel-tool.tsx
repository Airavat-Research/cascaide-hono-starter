import { memo, useCallback, useMemo } from "react";
import { Building2, Bed, Check, Loader2 } from 'lucide-react';
import { ToolComponentProps } from '../message-list';

// ---------------------------------------------------------------------------
// HotelOptions — Example input tool
//
// This is the canonical example of an INPUT TOOL in cascaide.
// An input tool renders a UI, waits for the user to act, then calls
// onComplete(result) to send a tool response and continue the cascade.
//
// The props come from the registry wiring in MessageList/MessageBubble —
// you don't need to think about toolCallId or handleToolResponse here.
//
// Props (from ToolComponentProps):
//   args        — what the LLM passed to this tool call (hotels array here)
//   onComplete  — call with a string result when the user has made a choice
//   isFinished  — true if the user already acted (e.g. on conversation reload)
//   savedResult — the result string from the previous action if isFinished
//
// To build your own input tool, copy this file and:
//   1. Replace HotelOptionsGrid with your own UI
//   2. Call onComplete(yourResultString) when the user acts
//   3. Use isFinished to make the UI read-only after completion
//   4. Register it in toolRegistry in message-list.tsx
// ---------------------------------------------------------------------------

export const HotelOptions = memo(({
    args,
    onComplete,
    isFinished,
    savedResult,
}: ToolComponentProps) => {

    // Parse the saved result back into a selection so we can highlight
    // the previously chosen hotel/room when isFinished is true.
    // The format is set by the string we pass to onComplete below.
    const selectedSelection = useMemo(() => {
        if (!savedResult) return null;
        const match = savedResult.match(/selected \[(.*?)\] and \[(.*?)\]/);
        if (!match) return null;
        return { hotel: match[1], room: match[2] };
    }, [savedResult]);

    const handleBooking = useCallback((hotelName: string, roomType: string) => {
        if (isFinished) return;
        // This string becomes the tool response content that the supervisor receives.
        // Shape it however is most useful for your LLM to act on.
        onComplete(`selected [${hotelName}] and [${roomType}]`);
    }, [onComplete, isFinished]);

    return (
        <div className={`my-8 border-l-4 pl-6 py-2 transition-all duration-500 ${isFinished ? 'border-green-500' : 'border-blue-500'}`}>
            <div className="flex items-center gap-3 mb-6">
                <div className={`w-3 h-3 rounded-full ${isFinished ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`} />
                <span className="text-sm font-black text-slate-800 uppercase tracking-tighter">
                    {isFinished ? 'Booking Confirmed' : 'Select Your Accommodation'}
                </span>
            </div>

            {args.hotels?.length > 0 ? (
                <HotelOptionsGrid
                    hotels={args.hotels}
                    onSelect={handleBooking}
                    isReadOnly={isFinished}
                    selectedSelection={selectedSelection}
                />
            ) : (
                <div className="text-xs text-gray-400 italic p-4 border border-dashed rounded-lg">
                    No hotel options found for your criteria.
                </div>
            )}
        </div>
    );
});

HotelOptions.displayName = 'HotelOptions';


// ---------------------------------------------------------------------------
// HotelOptionsGrid — pure UI, no cascade logic
//
// Renders the list of hotels and their room options.
// onSelect is called when the user clicks a room — HotelOptions above
// translates that into an onComplete call.
// ---------------------------------------------------------------------------

const HotelOptionsGrid = memo(({
    hotels,
    onSelect,
    isReadOnly = false,
    selectedSelection = null,
}: {
    hotels: any[];
    onSelect: (hotelName: string, roomType: string) => void;
    isReadOnly?: boolean;
    selectedSelection?: { hotel: string; room: string } | null;
}) => {
    return (
        <div className="flex flex-col space-y-6">
            {hotels.map((hotel, i) => (
                <div
                    key={i}
                    className={`flex flex-col md:flex-row border rounded-xl overflow-hidden bg-white shadow-sm transition-all md:h-72 ${
                        selectedSelection?.hotel === hotel.hotel_name
                            ? 'border-green-500 ring-1 ring-green-500'
                            : 'border-gray-200'
                    }`}
                >
                    {/* Hotel image */}
                    <div className="w-full md:w-80 h-48 md:h-full shrink-0 bg-slate-100 relative">
                        <img
                            src={hotel.hotel_image_url}
                            alt={hotel.hotel_name}
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-gray-700 shadow-sm flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            OPTION {i + 1}
                        </div>
                    </div>

                    {/* Hotel details */}
                    <div className="flex-1 flex flex-col p-5 min-w-0 bg-white">
                        <div className="mb-3">
                            <h3 className="text-lg font-bold text-slate-900 leading-tight truncate">
                                {hotel.hotel_name}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">
                                {hotel.description}
                            </p>
                        </div>

                        {/* Room selection */}
                        <div className="mt-auto pt-4 border-t border-slate-100">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                                <Bed className="w-3 h-3" /> Available Room Types
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {hotel.available_rooms.map((room: any, idx: number) => {
                                    const isThisSelected =
                                        selectedSelection?.hotel === hotel.hotel_name &&
                                        selectedSelection?.room === room.room_type;

                                    return (
                                        <button
                                            key={idx}
                                            disabled={isReadOnly}
                                            onClick={() => onSelect(hotel.hotel_name, room.room_type)}
                                            className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all group ${
                                                isThisSelected
                                                    ? 'bg-green-50 border-green-200 text-green-700'
                                                    : 'hover:border-blue-300 hover:bg-blue-50/30 border-slate-100 bg-slate-50/50'
                                            } ${isReadOnly && !isThisSelected ? 'opacity-50 grayscale-[0.5]' : ''}`}
                                        >
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold truncate">{room.room_type}</p>
                                                <p className="text-[10px] opacity-70">${room.price} / night</p>
                                            </div>
                                            {isThisSelected ? (
                                                <Check className="w-4 h-4 shrink-0" />
                                            ) : (
                                                <div className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-tight ${
                                                    isReadOnly
                                                        ? 'hidden'
                                                        : 'bg-white border border-slate-200 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-colors'
                                                }`}>
                                                    Book
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
});

HotelOptionsGrid.displayName = 'HotelOptionsGrid';