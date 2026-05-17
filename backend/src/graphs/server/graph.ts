import { searchAgentNode, searchToolNode } from '../../bubbles/searchAgent';
import { ServerWorkflowGraph } from '@cascaide-ts/core'
import { recursiveSearchAgentNode, recursiveSearchToolNode } from '../../bubbles/recursiveSearchAgent';
import { availabilityAgentNode, availabilityToolNode } from '../../bubbles/availabilityAgent';
import { bookingAgentNode } from '../../bubbles/bookingAgent';
import { hotelSupervisorNode } from '../../bubbles/hotelSupervisorAgent';



export const serverWorkflowGraph: ServerWorkflowGraph = {

    searchAgentNode,
    searchToolNode,
    recursiveSearchAgentNode,
    recursiveSearchToolNode,
    availabilityAgentNode,
    availabilityToolNode,
    bookingAgentNode,
    hotelSupervisorNode
    
  };



