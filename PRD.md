# OpenCanvas

## Overview

OpenCanvas is a node-based AI workflow orchestration platform that enables users to create consistent, repeatable workflows using Google's Gemini AI models for text generation, analysis, and multimodal processing.

Think of it as "n8n for AI" - specifically designed for Gemini models, text processing, content analysis, and intelligent automation workflows.

## Problem Statement

### Consistency Challenges

Managing consistent output from AI models has been a significant challenge for users across multiple domains:

**Content Creation:**

- In text generation and content analysis, maintaining consistent tone, style, and quality across iterations is crucial
- Users need to generate bulk content using identical workflows, but no comprehensive Gemini-focused solution exists in the market
- Content creators require systematic approaches for document analysis, text processing, and intelligent content generation

**Context Management:**

- Large Language Models (LLMs) respond most accurately when provided with clear, structured context
- Creating and maintaining clear context requires systematic workflow management
- Manual prompt engineering is time-consuming and error-prone

### Market Gap

Currently, there is no dedicated platform that combines:

- Visual workflow design for Gemini AI operations
- Consistent text processing and analysis across multiple Gemini models
- Bulk content generation and analysis with maintained quality and consistency
- Integration of various Gemini capabilities (text, vision, multimodal) in a unified interface

## Technical Architecture

### Authentication & User Management
- **Authentication System**: Better Auth implementation
- **Login Methods**: Email and password authentication
- **Database**: PostgreSQL with Prisma ORM
- **User Sessions**: Secure session management and token-based authentication
- **User Profiles**: Individual user accounts with workflow history and credit tracking

### Core Technology Stack
- **Frontend**: Next.js with React
- **UI Components**: Shadcn/ui component library
- **Workflow Engine**: React Flow for node-based interface
- **Database**: PostgreSQL with Prisma ORM
- **Media Storage**: Cloudflare R2 for file and media management
- **Authentication**: Better Auth for user management

## Core Features & Functionality

### 1. User Dashboard
After successful login, users access a comprehensive dashboard featuring:

- **Project Overview**: Grid view of all user workflows/projects
- **Quick Actions**: Create new workflow, duplicate existing workflows
- **Recent Activity**: History of recent workflow runs and results
- **Credit Balance**: Current available credits and usage analytics
- **Workflow Library**: Access to saved and shared workflow templates

### 2. Workflow Creation & Management

#### Project/Workflow Management
- **Create New Workflow**: Start with blank canvas or templates
- **Open Existing Workflow**: Load and edit saved workflows
- **Workflow Versioning**: Save different versions of workflows
- **Sharing & Collaboration**: Share workflows with other users
- **Import/Export**: Import workflows from files or export for backup

#### Workflow Editor Interface
- **Canvas Area**: Central workspace for node arrangement
- **Node Library**: Left sidebar containing all available nodes and tools
- **Properties Panel**: Right sidebar for node configuration
- **Connection System**: Visual connections between nodes showing data flow
- **Zoom & Navigation**: Pan, zoom, and navigate large workflows

### 3. Node System Architecture

#### Node Categories

**Input Nodes:**
- **Text Input**: System prompts, user prompts, instructions
- **Media Input**: Images, videos, audio files
- **Parameter Input**: Numbers, dropdowns, toggles for model configuration
- **File Upload**: Direct file uploads to workflow

**AI Model Nodes (Gemini-Based):**

**Text Generation Models:**
- Gemini Pro (Advanced text generation and reasoning)
- Gemini Flash (Fast text processing and generation)
- Gemini Ultra (Premium text generation with enhanced capabilities)

**Vision & Analysis Models:**
- Gemini Vision Pro (Image analysis, description, and understanding)
- Gemini Vision Flash (Fast image processing and analysis)

**Multimodal Models:**
- Gemini Multimodal Pro (Text + Image input/output processing)
- Gemini Multimodal Flash (Fast multimodal processing)

**Code Generation Models:**
- Gemini Code Pro (Code generation, analysis, and debugging)
- Gemini Code Flash (Fast code completion and suggestions)

**Processing Nodes:**
- **Image Processor**: Resize, crop, filter, enhance images
- **Text Processor**: Format, combine, transform text inputs
- **Logic Nodes**: Conditional statements, loops, data manipulation
- **Output Formatter**: Format results for specific outputs

**Utility Nodes:**
- **Prompt Templates**: Reusable prompt structures
- **Style Reference**: Apply consistent styling across generations
- **Batch Processor**: Handle multiple inputs simultaneously
- **Quality Controller**: Ensure output meets specified criteria

#### Node Properties & Configuration

**Standard Node Features:**
- **Input Ports**: Clearly defined connection points for incoming data
- **Output Ports**: Connection points for outgoing results
- **Configuration Panel**: Model-specific settings and parameters
- **Preview Mode**: Real-time preview of node output when possible
- **Error Handling**: Visual indicators for node errors or warnings
- **Credit Display**: Real-time credit cost estimation per node

**Node-Specific Configurations:**

**AI Model Nodes:**
- Model selection and version control
- Generation parameters (resolution, quality, steps)
- Advanced settings (seed, guidance scale, aspect ratio)
- Batch size and iteration controls
- Output format specifications

**Example: Gemini Pro Node Configuration:**
- **Inputs**: System Prompt, User Prompt, Context, Temperature, Max Tokens
- **Settings**: Model Version (Pro/Flash/Ultra), Response Format, Safety Settings
- **Advanced**: Top-K, Top-P, Stop Sequences, Response Streaming
- **Output**: Generated text with metadata and token usage
- **Credits**: Variable based on input/output tokens and model tier

**Example: Gemini Vision Pro Node Configuration:**
- **Inputs**: Text Prompt, Image Input, Analysis Type, Detail Level
- **Settings**: Response Format, Image Resolution, Analysis Depth
- **Advanced**: Focus Areas, Output Structure, Confidence Thresholds  
- **Output**: Image analysis, descriptions, or extracted information
- **Credits**: Based on image size and analysis complexity

**Example: Gemini Multimodal Pro Node Configuration:**
- **Inputs**: Text Prompt, Multiple Images, Video Input (if supported), Instructions
- **Settings**: Processing Mode, Output Format, Quality Level
- **Advanced**: Cross-modal reasoning, Context window, Response length
- **Output**: Multimodal content analysis or generation
- **Credits**: Premium pricing for multimodal processing

### 4. Credit System & Usage Management

#### Credit-Based Pricing Model
- **Per-Token Usage**: Gemini models consume credits based on input and output tokens
- **Model Tier Pricing**: Different Gemini models have different credit costs
  - Gemini Flash: Lower credit cost for speed-optimized processing
  - Gemini Pro: Standard credit rate for balanced performance
  - Gemini Ultra: Premium credit pricing for advanced capabilities
  - Multimodal Processing: Higher credit cost for image/video analysis
- **Real-Time Tracking**: Live credit balance and token usage monitoring
- **Batch Processing**: Reduced per-token cost for bulk text operations

#### Credit Management Features
- **Usage Analytics**: Detailed breakdown of credit consumption
- **Budget Alerts**: Notifications when approaching credit limits
- **Purchase Options**: Multiple credit packages available
- **Usage History**: Detailed logs of all credit transactions

### 5. Media Storage & Management

#### Cloudflare R2 Integration
- **File Upload**: Direct upload of documents, images, and text files for processing
- **CDN Distribution**: Global content delivery for fast access to workflow assets
- **Version Control**: Multiple versions of uploaded documents and generated content
- **Format Support**: Wide range of text, document, image, and data formats
- **Storage Optimization**: Automatic compression and format optimization for text-heavy workflows

#### Asset Management
- **Document Library**: Organized storage of all user uploads and generated content
- **Tagging System**: Categorize and search text documents, prompts, and outputs
- **Template Storage**: Save and reuse prompt templates and workflow configurations
- **Sharing**: Share documents and templates between workflows and users
- **Backup**: Automatic backup of all generated text content and analysis results

### 6. User Interface Design

#### Dashboard Layout
- **Navigation Header**: User profile, credits, notifications
- **Project Grid**: Visual grid of workflow thumbnails
- **Quick Actions**: Prominently placed create/import buttons
- **Activity Feed**: Recent workflows and community highlights

#### Workflow Editor Layout
- **Three-Panel Design**: 
  - Left: Node library and categories
  - Center: Canvas workspace
  - Right: Properties and settings panel
- **Responsive Design**: Optimized for various screen sizes
- **Dark Theme**: Professional dark interface as shown in screenshots
- **Accessibility**: Keyboard shortcuts and screen reader support

### 7. Workflow Execution & Results

#### Real-Time Processing
- **Live Progress**: Real-time updates during workflow execution
- **Queue Management**: Handle multiple concurrent workflow runs
- **Error Recovery**: Graceful handling of node failures
- **Result Caching**: Cache intermediate results for faster re-runs

#### Output Management
- **Result Gallery**: Organized display of all generated outputs
- **Download Options**: Multiple format and quality options
- **Sharing**: Direct sharing of results via links
- **Export**: Batch export of workflow results

## Success Metrics

### User Engagement
- **Daily Active Users**: Target consistent user growth
- **Workflow Creation Rate**: Number of new workflows created daily
- **Credit Consumption**: Healthy credit usage indicating platform value
- **User Retention**: Long-term user engagement and return rates

### Technical Performance
- **Workflow Execution Speed**: Average time from start to completion
- **System Uptime**: 99.9% availability target
- **Error Rates**: Minimal node execution failures
- **Media Load Times**: Fast asset loading and preview generation

### Business Metrics
- **Credit Sales**: Revenue from credit purchases
- **User Conversion**: Free to paid user conversion rates
- **Feature Adoption**: Usage rates of different node types
- **Community Growth**: Shared workflows and collaboration metrics
